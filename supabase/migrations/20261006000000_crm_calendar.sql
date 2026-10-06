-- Shared internal calendar. Every write is serialized and audited through RPCs.
create table public.crm_appointments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  prospect_id uuid references public.reservas_prospects(id),
  agent_run_id uuid unique,
  title text not null check (length(btrim(title)) between 1 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','held','cancelled')),
  confirmation text not null default 'confirmed' check (confirmation in ('pending','confirmed')),
  responsible_id uuid references public.profiles(id),
  notes text not null default '' check (length(notes)<=2000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at>starts_at and ends_at<=starts_at+interval '2 hours')
);
create index crm_appointments_time_idx on public.crm_appointments(starts_at) where status='scheduled';
alter table public.crm_appointments enable row level security;
create policy crm_appointments_read on public.crm_appointments for select to authenticated using(public.is_internal_member());
grant select on public.crm_appointments to authenticated;

create table public.crm_calendar_config (
  id integer primary key check (id=1),
  duration_minutes integer not null default 20 check (duration_minutes between 15 and 20),

  updated_at timestamptz not null default now()
);
insert into public.crm_calendar_config(id) values (1);
alter table public.crm_calendar_config enable row level security;
create policy crm_calendar_config_read on public.crm_calendar_config for select to authenticated using(public.is_internal_member());
grant select on public.crm_calendar_config to authenticated;

create table public.crm_calendar_audit (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.crm_appointments(id),
  actor_id uuid not null references public.profiles(id),
  action text not null,
  details jsonb not null default '{}',
  recorded_at timestamptz not null default now()
);
alter table public.crm_calendar_audit enable row level security;
create policy crm_calendar_audit_read on public.crm_calendar_audit for select to authenticated using(public.is_internal_member());
grant select on public.crm_calendar_audit to authenticated;

create function public.reservas_calendar_availability(p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_config public.crm_calendar_config%rowtype; v_slots jsonb;
begin
  if p_from is null or p_to is null or p_from<now()-interval '1 hour' or p_to<=p_from or p_to>p_from+interval '14 days' then
    return jsonb_build_object('ok',false,'error','invalid_range');
  end if;
  select * into v_config from public.crm_calendar_config where id=1;
  -- No business-hour restrictions: coordinate the time with the prospect.
  with slots as (select s as starts_at,s+make_interval(mins=>v_config.duration_minutes) as ends_at
    from generate_series(greatest(p_from,now()+interval '15 minutes'),
      p_to-make_interval(mins=>v_config.duration_minutes),interval '20 minutes') s),
  available as (select distinct starts_at,ends_at from slots s where starts_at>=greatest(p_from,now()+interval '15 minutes') and ends_at<=p_to
    and not exists(select 1 from public.crm_appointments a where a.status='scheduled' and a.starts_at<s.ends_at and a.ends_at>s.starts_at)
    order by starts_at limit 100)
  select coalesce(jsonb_agg(to_jsonb(s)),'[]') into v_slots from available s;
  return jsonb_build_object('ok',true,'configured',true,'timezone','America/Argentina/Buenos_Aires',
    'duration_minutes',v_config.duration_minutes,'minimum_minutes',15,'slots',v_slots,'limit',100,
    'from',p_from,'to',p_to,'unrestricted_hours',true);
end;
$$;
revoke all on function public.reservas_calendar_availability(timestamptz,timestamptz) from public;

-- Private helper shared by the member RPC and the authenticated n8n command.
create function public.reservas_calendar_book(p_prospect_id uuid,p_run_id uuid,p_start timestamptz,p_end timestamptz,
  p_actor uuid,p_title text,p_notes text,p_request_id uuid default null,p_responsible uuid default null,p_confirmation text default 'confirmed')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_existing public.crm_appointments%rowtype; v_config public.crm_calendar_config%rowtype;
begin
  if p_start is null or p_end is null or p_start<=now() or p_end<p_start+interval '15 minutes' or p_end>p_start+interval '20 minutes'
    or coalesce(length(btrim(p_title)),0) not between 1 and 200 or length(coalesce(p_notes,''))>2000
    or coalesce(p_confirmation,'') not in ('pending','confirmed')
    or (p_responsible is not null and not exists(select 1 from public.profiles where id=p_responsible))
    or not exists(select 1 from public.profiles where id=p_actor) then
    return jsonb_build_object('ok',false,'error','invalid_appointment');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('crm-calendar',0));
  select * into v_existing from public.crm_appointments where request_id=coalesce(p_request_id,p_run_id);
  if found then
    if v_existing.starts_at is distinct from p_start or v_existing.ends_at is distinct from p_end
      or v_existing.prospect_id is distinct from p_prospect_id or v_existing.title is distinct from p_title
      or v_existing.responsible_id is distinct from p_responsible or v_existing.confirmation is distinct from p_confirmation then return jsonb_build_object('ok',false,'error','request_conflict'); end if;
    return jsonb_build_object('ok',true,'appointment_id',v_existing.id,'duplicate',true);
  end if;
  if p_prospect_id is not null and not exists(select 1 from public.reservas_prospects where id=p_prospect_id and not do_not_contact) then
    return jsonb_build_object('ok',false,'error','blocked_prospect');
  end if;
  if p_run_id is not null then
    if p_end<p_start+interval '15 minutes' or p_end>p_start+interval '20 minutes' then
      return jsonb_build_object('ok',false,'error','invalid_meeting_duration'); end if;
  end if;
  if exists(select 1 from public.crm_appointments where status='scheduled' and starts_at<p_end and ends_at>p_start) then
    return jsonb_build_object('ok',false,'error','slot_taken');
  end if;
  insert into public.crm_appointments(request_id,prospect_id,agent_run_id,title,starts_at,ends_at,responsible_id,notes,created_by,confirmation)
    values(coalesce(p_request_id,p_run_id),p_prospect_id,p_run_id,p_title,p_start,p_end,p_responsible,coalesce(p_notes,''),p_actor,p_confirmation) returning id into v_id;
  insert into public.crm_calendar_audit(appointment_id,actor_id,action) values(v_id,p_actor,'scheduled');
  if p_prospect_id is not null and p_confirmation='confirmed' then
    insert into public.reservas_prospect_events(prospect_id,source,source_event_id,event_type,actor,occurred_at,details)
    values(p_prospect_id,'crm','calendar:'||v_id::text,'meeting_scheduled','crm:'||p_actor::text,now(),
      jsonb_build_object('scheduled_for',p_start,'ends_at',p_end,'timezone','America/Argentina/Buenos_Aires','appointment_id',v_id));
  end if;
  return jsonb_build_object('ok',true,'appointment_id',v_id);
end;
$$;
revoke all on function public.reservas_calendar_book(uuid,uuid,timestamptz,timestamptz,uuid,text,text,uuid,uuid,text) from public;

create function public.manage_crm_calendar(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_action text:=p_payload->>'action'; v_appointment public.crm_appointments%rowtype;
begin
  if not public.is_internal_member() then raise exception 'not authorized' using errcode='42501'; end if;
  if v_action='create' then return public.reservas_calendar_book(
    nullif(p_payload->>'prospect_id','')::uuid,null,public.reservas_valid_timestamp(p_payload->>'start'),
    public.reservas_valid_timestamp(p_payload->>'end'),auth.uid(),p_payload->>'title',p_payload->>'notes',(p_payload->>'request_id')::uuid,
    nullif(p_payload->>'responsible_id','')::uuid,coalesce(p_payload->>'confirmation','confirmed')); end if;
  if coalesce(v_action,'') not in ('held','cancelled','confirm','assign') then return jsonb_build_object('ok',false,'error','invalid_action'); end if;
  select * into v_appointment from public.crm_appointments where id=(p_payload->>'appointment_id')::uuid for update;
  if not found or v_appointment.status<>'scheduled' then return jsonb_build_object('ok',false,'error','invalid_transition'); end if;
  if v_action='assign' then
    if nullif(p_payload->>'responsible_id','') is not null and not exists(select 1 from public.profiles where id=(p_payload->>'responsible_id')::uuid) then return jsonb_build_object('ok',false,'error','invalid_responsible'); end if;
    update public.crm_appointments set responsible_id=nullif(p_payload->>'responsible_id','')::uuid,updated_at=now() where id=v_appointment.id;
    insert into public.crm_calendar_audit(appointment_id,actor_id,action,details) values(v_appointment.id,auth.uid(),'assigned',jsonb_build_object('responsible_id',p_payload->>'responsible_id'));
    return jsonb_build_object('ok',true);
  end if;
  if v_action='confirm' then
    if v_appointment.confirmation='confirmed' then return jsonb_build_object('ok',true,'duplicate',true); end if;
    update public.crm_appointments set confirmation='confirmed',updated_at=now() where id=v_appointment.id;
    insert into public.crm_calendar_audit(appointment_id,actor_id,action) values(v_appointment.id,auth.uid(),'confirmed');
    if v_appointment.prospect_id is not null then
      insert into public.reservas_prospect_events(prospect_id,source,source_event_id,event_type,actor,occurred_at,details)
      values(v_appointment.prospect_id,'crm','calendar:'||v_appointment.id::text,'meeting_scheduled','crm:'||auth.uid()::text,now(),
        jsonb_build_object('scheduled_for',v_appointment.starts_at,'ends_at',v_appointment.ends_at,'timezone','America/Argentina/Buenos_Aires','appointment_id',v_appointment.id));
    end if;
    return jsonb_build_object('ok',true);
  end if;
  if v_action='held' and v_appointment.confirmation<>'confirmed' then return jsonb_build_object('ok',false,'error','confirmation_required'); end if;
  if v_action='held' and v_appointment.starts_at>now() then return jsonb_build_object('ok',false,'error','meeting_in_future'); end if;
  update public.crm_appointments set status=v_action,updated_at=now() where id=v_appointment.id;
  insert into public.crm_calendar_audit(appointment_id,actor_id,action) values(v_appointment.id,auth.uid(),v_action);
  if v_appointment.prospect_id is not null then
    insert into public.reservas_prospect_events(prospect_id,source,source_event_id,event_type,actor,occurred_at,details)
    values(v_appointment.prospect_id,'crm','calendar:'||v_appointment.id::text||':'||v_action,
      case when v_action='held' then 'meeting_held' else 'meeting_cancelled' end,'crm:'||auth.uid()::text,now(),
      jsonb_build_object('appointment_id',v_appointment.id));
  end if;
  return jsonb_build_object('ok',true);
exception when invalid_text_representation or datetime_field_overflow then
  return jsonb_build_object('ok',false,'error','invalid_payload');
end;
$$;
revoke all on function public.manage_crm_calendar(jsonb) from public;
grant execute on function public.manage_crm_calendar(jsonb) to authenticated;

create function public.get_crm_calendar(p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
begin
  if not public.is_internal_member() then raise exception 'not authorized' using errcode='42501'; end if;
  if p_from is null or p_to is null or p_to<=p_from or p_to>p_from+interval '62 days' then raise exception 'invalid range'; end if;
  return jsonb_build_object('timezone','America/Argentina/Buenos_Aires','from',p_from,'to',p_to,'generated_at',now(),
    'appointments',coalesce((select jsonb_agg(to_jsonb(a) order by a.starts_at,a.id) from (
      select a.id,a.title,a.starts_at,a.ends_at,a.status,a.confirmation,a.prospect_id,a.responsible_id,a.notes,
        p.full_name as responsible_name from public.crm_appointments a left join public.profiles p on p.id=a.responsible_id
      where a.starts_at<p_to and a.ends_at>p_from
    ) a),'[]'::jsonb),'config',(select to_jsonb(c) from public.crm_calendar_config c where id=1),
    'team',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',full_name) order by full_name) from public.profiles),'[]'::jsonb));
end;
$$;
revoke all on function public.get_crm_calendar(timestamptz,timestamptz) from public;
grant execute on function public.get_crm_calendar(timestamptz,timestamptz) to authenticated;
notify pgrst,'reload schema';
