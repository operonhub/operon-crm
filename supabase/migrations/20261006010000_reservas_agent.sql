-- A bounded commercial agent. It can draft; only a CRM member can approve.
create table public.reservas_agent_runs (
  id uuid primary key,
  prospect_id uuid not null references public.reservas_prospects(id),
  status text not null default 'queued' check (status in ('queued','running','review','failed','blocked')),
  lease_id uuid,
  context_version text,
  model_started_at timestamptz,
  audio_started_at timestamptz,
  result jsonb,
  error_code text,
  approval text not null default 'pending' check (approval in ('pending','approved','rejected')),
  approved_message text,
  appointment_id uuid,
  delivery_state text not null default 'none' check (delivery_state in ('none','transferring','queued','sent','blocked')),
  delivery_lease uuid,
  provider_message_id text,
  requested_by uuid references public.profiles(id),
  source_message_id uuid unique references public.social_messages(id),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index reservas_agent_runs_prospect_idx on public.reservas_agent_runs(prospect_id,created_at desc);
alter table public.reservas_agent_runs enable row level security;
create policy reservas_agent_runs_read on public.reservas_agent_runs for select to authenticated
  using (public.is_internal_member());
grant select on public.reservas_agent_runs to authenticated;

create table public.reservas_audio_transcripts (
  message_id uuid primary key references public.social_messages(id),
  run_id uuid not null references public.reservas_agent_runs(id),
  transcript text not null check (length(transcript) between 1 and 10000),
  created_at timestamptz not null default now()
);
alter table public.reservas_audio_transcripts enable row level security;
create policy reservas_audio_transcripts_read on public.reservas_audio_transcripts for select to authenticated using(public.is_internal_member());
grant select on public.reservas_audio_transcripts to authenticated;

create table public.reservas_agent_knowledge (
  id text primary key,
  content text not null check (length(content) between 1 and 12000),
  updated_at timestamptz not null default now()
);
alter table public.reservas_agent_knowledge enable row level security;
create policy reservas_agent_knowledge_read on public.reservas_agent_knowledge for select to authenticated
  using (public.is_internal_member());
grant select on public.reservas_agent_knowledge to authenticated;
insert into public.reservas_agent_knowledge(id,content) values ('commercial',
  'Operon Reservas: prospección comercial de alojamientos. Reuniones de 15 a 20 minutos en el calendario interno compartido por Santiago y Tommy. Sin horarios de atención fijos. Responsable elegido por el equipo. Mensajes y reuniones del agente sujetos a aprobación en el CRM. Precios y condiciones comerciales: no registrados. Configuración comercial del agente: administrada en el perfil dedicado de Hermes por el equipo.');

-- Internal helper: never grant to API roles. No secrets or unrelated CRM rows.
create function public.reservas_agent_context(p_prospect_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_prospect jsonb; v_messages jsonb; v_events jsonb; v_memory jsonb; v_knowledge jsonb; v_base jsonb;
begin
  select jsonb_build_object('id',p.id,'lead_id',p.lead_id,'name',coalesce(o.name,'Alojamiento'),
    'phone_e164',p.phone_e164,'sheet_id',p.sheet_id,'sheet_lead_id',p.sheet_lead_id,
    'sheet_url',p.sheet_url,'do_not_contact',p.do_not_contact,'suppression_reason',p.suppression_reason,
    'updated_at',p.updated_at) into v_prospect
  from public.reservas_prospects p join public.leads l on l.id=p.lead_id
  left join public.organizations o on o.id=l.organization_id where p.id=p_prospect_id;
  if v_prospect is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.sent_at,m.id),'[]') into v_messages from (
    select m.id,m.conversation_id,m.direction,left(m.body,3000) as body,m.sent_at,m.delivery_status,
      m.attachments,t.transcript
    from public.social_messages m join public.social_conversations c on c.id=m.conversation_id
    left join public.reservas_audio_transcripts t on t.message_id=m.id
    where c.lead_id=(v_prospect->>'lead_id')::uuid and c.platform='whatsapp'
      and m.deleted_at is null and m.delivery_status in ('sent','delivered','read')
    order by m.sent_at desc,m.id desc limit 30
  ) m;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.occurred_at,e.id),'[]') into v_events from (
    select id,event_type,occurred_at,details from public.reservas_prospect_events
    where prospect_id=p_prospect_id order by occurred_at desc,recorded_at desc,id desc limit 20
  ) e;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at),'[]') into v_memory from (
    select id,result,approval,approved_message,created_at from public.reservas_agent_runs
    where prospect_id=p_prospect_id and status='review' order by created_at desc,id desc limit 5
  ) r;
  select jsonb_build_object('content',content,'updated_at',updated_at) into v_knowledge
    from public.reservas_agent_knowledge where id='commercial';
  v_base:=jsonb_build_object('prospect',v_prospect,'messages',v_messages,'events',v_events,'knowledge',v_knowledge);
  return v_base || jsonb_build_object('ok',true,'memory',v_memory,'context_version',md5(v_base::text));
end;
$$;
revoke all on function public.reservas_agent_context(uuid) from public;

create function public.request_reservas_agent(p_prospect_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_existing public.reservas_agent_runs%rowtype;
begin
  if not public.is_internal_member() then raise exception 'not authorized' using errcode='42501'; end if;
  perform 1 from public.reservas_prospects where id=p_prospect_id and not do_not_contact;
  if not found then return jsonb_build_object('ok',false,'error','blocked_or_not_found'); end if;
  if not exists(select 1 from public.social_conversations c join public.social_messages i on i.conversation_id=c.id
    join public.reservas_prospects p on p.lead_id=c.lead_id
    where p.id=p_prospect_id and c.platform='whatsapp' and i.direction='inbound' and i.deleted_at is null
    and i.delivery_status in ('sent','delivered','read') and exists(select 1 from public.social_messages o
      where o.conversation_id=c.id and o.direction='outbound' and o.deleted_at is null
      and o.delivery_status in ('sent','delivered','read') and o.sent_at<i.sent_at)) then
    return jsonb_build_object('ok',false,'error','awaiting_first_reply');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('reservas-agent:'||p_prospect_id::text,0));
  select * into v_existing from public.reservas_agent_runs where id=p_request_id;
  if found then
    if v_existing.prospect_id<>p_prospect_id then return jsonb_build_object('ok',false,'error','request_conflict'); end if;
    return jsonb_build_object('ok',true,'run_id',v_existing.id,'status',v_existing.status);
  end if;
  select * into v_existing from public.reservas_agent_runs
    where prospect_id=p_prospect_id and status in ('queued','running') order by created_at desc limit 1;
  if found then return jsonb_build_object('ok',true,'run_id',v_existing.id,'status',v_existing.status); end if;
  insert into public.reservas_agent_runs(id,prospect_id,requested_by) values(p_request_id,p_prospect_id,auth.uid());
  return jsonb_build_object('ok',true,'run_id',p_request_id,'status','queued');
end;
$$;
revoke all on function public.request_reservas_agent(uuid,uuid) from public;
grant execute on function public.request_reservas_agent(uuid,uuid) to authenticated;

-- One private RPC covers the exact capabilities offered to n8n.
create function public.reservas_agent_command(p_secret text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_run public.reservas_agent_runs%rowtype; v_context jsonb; v_result jsonb:=p_payload->'result';
  v_action text:=p_payload->>'action'; v_lease uuid; v_closed boolean;
begin
  if not exists(select 1 from public.ingest_config where id=1 and secret=p_secret) then
    return jsonb_build_object('ok',false,'error','unauthorized');
  end if;
  select * into v_run from public.reservas_agent_runs where id=(p_payload->>'run_id')::uuid for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  v_context:=public.reservas_agent_context(v_run.prospect_id);
  select coalesce((select event_type in ('won','lost') from public.reservas_prospect_events
    where prospect_id=v_run.prospect_id and event_type in ('won','lost','meeting_scheduled','meeting_held','meeting_cancelled','proposal_sent')
    order by occurred_at desc,recorded_at desc,id desc limit 1),false) into v_closed;
  if v_action='context' then return v_context || jsonb_build_object('run_id',v_run.id,'status',v_run.status); end if;
  if v_action='knowledge' then return jsonb_build_object('ok',true,'knowledge',v_context->'knowledge'); end if;
  if v_action='state' then return jsonb_build_object('ok',true,'run_id',v_run.id,'status',v_run.status,'approval',v_run.approval); end if;
  if v_action='availability' then
    return public.reservas_calendar_availability(
      public.reservas_valid_timestamp(p_payload->>'from'),public.reservas_valid_timestamp(p_payload->>'to'));
  end if;
  if v_action='book' then
    if v_run.status<>'review' or v_run.approval<>'approved' or v_run.result->>'action'<>'book_meeting' then
      return jsonb_build_object('ok',false,'error','booking_not_approved');
    end if;
    if v_run.appointment_id is not null then return jsonb_build_object('ok',true,'appointment_id',v_run.appointment_id,'duplicate',true); end if;
    if v_run.context_version is distinct from v_context->>'context_version'
      or coalesce((v_context->'prospect'->>'do_not_contact')::boolean,true) or v_closed then
      return jsonb_build_object('ok',false,'error','stale_or_blocked');
    end if;
    v_result:=public.reservas_calendar_book(v_run.prospect_id,v_run.id,
      public.reservas_valid_timestamp(v_run.result->'meeting'->>'start'),
      public.reservas_valid_timestamp(v_run.result->'meeting'->>'end'),
      v_run.decided_by,(v_context->'prospect'->>'name'),'Coordinada por agente; aprobada en CRM');
    if coalesce((v_result->>'ok')::boolean,false) is not true then return v_result; end if;
    update public.reservas_agent_runs set appointment_id=(v_result->>'appointment_id')::uuid where id=v_run.id;
    return v_result;
  end if;
  if v_action='claim' then
    if v_run.status<>'queued' then return jsonb_build_object('ok',true,'claimed',false,'status',v_run.status); end if;
    if coalesce((v_context->'prospect'->>'do_not_contact')::boolean,true) or v_closed then
      update public.reservas_agent_runs set status='blocked',finished_at=now(),error_code='contact_blocked_or_closed' where id=v_run.id;
      return jsonb_build_object('ok',true,'claimed',false,'status','blocked');
    end if;
    v_lease:=gen_random_uuid();
    update public.reservas_agent_runs set status='running',lease_id=v_lease,
      context_version=v_context->>'context_version' where id=v_run.id;
    return v_context || jsonb_build_object('ok',true,'claimed',true,'run_id',v_run.id,'lease_id',v_lease);
  end if;
  if v_action in ('dispatch','queued','send_guard','delivered') then
    if v_run.status<>'review' or v_run.approval<>'approved' or v_run.result->>'action' not in ('draft_message','follow_up') then
      return jsonb_build_object('ok',false,'error','message_not_approved');
    end if;
    if v_action='delivered' then
      if v_run.delivery_state='sent' and v_run.provider_message_id=p_payload->>'provider_message_id' then return jsonb_build_object('ok',true,'duplicate',true); end if;
      if v_run.delivery_state<>'queued' or coalesce(p_payload->>'provider_message_id','') !~ '^[A-Za-z0-9_-]{1,160}$' then
        return jsonb_build_object('ok',false,'error','invalid_delivery'); end if;
      update public.reservas_agent_runs set delivery_state='sent',provider_message_id=p_payload->>'provider_message_id' where id=v_run.id;
      return jsonb_build_object('ok',true);
    end if;
    if v_action='queued' then
      if v_run.delivery_state<>'transferring' or v_run.delivery_lease is distinct from (p_payload->>'lease_id')::uuid then
        return jsonb_build_object('ok',false,'error','lease_conflict'); end if;
      update public.reservas_agent_runs set delivery_state='queued' where id=v_run.id;
      return jsonb_build_object('ok',true,'status','queued');
    end if;
    if v_run.context_version is distinct from v_context->>'context_version'
      or coalesce((v_context->'prospect'->>'do_not_contact')::boolean,true) or v_closed then
      return jsonb_build_object('ok',true,'claimed',false,'permitir',false,'error','stale_or_blocked','tipo','contacto','motivo','El contexto cambió o el contacto está bloqueado');
    end if;
    if v_action='send_guard' then return jsonb_build_object('ok',true,'permitir',
      coalesce(v_run.delivery_state='queued' and p_payload->>'message'=v_run.approved_message
        and p_payload->>'phone_e164'=v_context->'prospect'->>'phone_e164',false),
      'tipo','contacto','motivo','Comprobar aprobación y contenido exacto del mensaje'); end if;
    if v_run.delivery_state<>'none' then return jsonb_build_object('ok',true,'claimed',false,'status',v_run.delivery_state); end if;
    v_lease:=gen_random_uuid();
    update public.reservas_agent_runs set delivery_state='transferring',delivery_lease=v_lease where id=v_run.id;
    return jsonb_build_object('ok',true,'claimed',true,'run_id',v_run.id,'lease_id',v_lease,
      'queue',jsonb_build_object('tanda_id','agent:'||v_run.id::text,'telefono',regexp_replace(v_context->'prospect'->>'phone_e164','[^0-9]','','g'),
      'lead_id',v_context->'prospect'->>'sheet_lead_id','sheet_id',v_context->'prospect'->>'sheet_id',
      'prospect_id',v_run.prospect_id,'crm_lead_id',v_context->'prospect'->>'lead_id','phone_e164',v_context->'prospect'->>'phone_e164',
      'sheet_row',0,'nombre_negocio',v_context->'prospect'->>'name','mensaje',v_run.approved_message,
      'estado','pendiente','programado_para',now()+interval '20 seconds','intentos_guard',0,'detalle','agent_reply'));
  end if;
  if v_action not in ('finish','fail','suppress','transcript','model_context','audio_context','tool_context') then return jsonb_build_object('ok',false,'error','invalid_action'); end if;
  if v_run.status<>'running' or v_run.lease_id is distinct from (p_payload->>'lease_id')::uuid then
    return jsonb_build_object('ok',false,'error','lease_conflict');
  end if;
  if v_action in ('model_context','audio_context','tool_context') then
    if v_run.context_version is distinct from v_context->>'context_version'
      or coalesce((v_context->'prospect'->>'do_not_contact')::boolean,true) or v_closed then
      return jsonb_build_object('ok',false,'error','stale_or_blocked');
    end if;
    if v_action='model_context' then
      if v_run.model_started_at is not null then return jsonb_build_object('ok',false,'error','already_started'); end if;
      update public.reservas_agent_runs set model_started_at=now() where id=v_run.id;
    elsif v_action='audio_context' then
      if v_run.audio_started_at is not null then return jsonb_build_object('ok',false,'error','already_started'); end if;
      update public.reservas_agent_runs set audio_started_at=now() where id=v_run.id;
    end if;
    return v_context||jsonb_build_object('run_id',v_run.id,'lease_id',v_run.lease_id);
  end if;
  if v_action='transcript' then
    if v_run.context_version is distinct from v_context->>'context_version'
      or length(coalesce(p_payload->>'transcript','')) not between 1 and 10000
      or not exists(select 1 from jsonb_array_elements(v_context->'messages') m
        where m->>'id'=p_payload->>'message_id' and m->>'direction'='inbound'
        and jsonb_typeof(m->'attachments')='array'
        and exists(select 1 from jsonb_array_elements(m->'attachments') a
          where coalesce(a->>'type',a->>'kind','') in ('audio','voice')
            or coalesce(a->>'mimeType',a->>'mime_type','') like 'audio/%')) then
      return jsonb_build_object('ok',false,'error','invalid_transcript');
    end if;
    insert into public.reservas_audio_transcripts(message_id,run_id,transcript)
      values((p_payload->>'message_id')::uuid,v_run.id,p_payload->>'transcript') on conflict(message_id) do nothing;
    v_context:=public.reservas_agent_context(v_run.prospect_id);
    update public.reservas_agent_runs set context_version=v_context->>'context_version' where id=v_run.id;
    return v_context||jsonb_build_object('run_id',v_run.id,'lease_id',v_run.lease_id);
  end if;
  if v_action='suppress' then
    -- Deterministic branch: only the latest actual inbound message is evidence.
    if not exists(select 1 from (select m from jsonb_array_elements(v_context->'messages') m
      order by m->>'sent_at' desc,m->>'id' desc limit 1) latest
      where m->>'id'=p_payload->>'message_id' and m->>'direction'='inbound'
      and lower(btrim(coalesce(nullif(m->>'transcript',''),m->>'body',''))) ~ '^(stop|baja|no me contactes|no me escribas|no quiero recibir mensajes|desuscribirme)[.! ]*$') then
      return jsonb_build_object('ok',false,'error','suppression_evidence_required');
    end if;
    perform public.ingest_reservas_event(p_secret,jsonb_build_object('kind','event','prospect_id',v_run.prospect_id,
      'event_id','agent-optout:'||(p_payload->>'message_id'),'event_type','suppressed','actor','n8n:reservas-agent',
      'occurred_at',now(),'details',jsonb_build_object('reason','Solicitud de no contacto en mensaje recibido')));
    update public.reservas_agent_runs set status='blocked',error_code='opt_out',finished_at=now() where id=v_run.id;
    return jsonb_build_object('ok',true,'status','blocked');
  end if;
  if v_action='fail' then
    update public.reservas_agent_runs set status='failed',error_code=left(coalesce(p_payload->>'error_code','agent_failed'),100),finished_at=now() where id=v_run.id;
    return jsonb_build_object('ok',true,'status','failed');
  end if;
  if v_run.context_version is distinct from v_context->>'context_version'
    or coalesce((v_context->'prospect'->>'do_not_contact')::boolean,true) or v_closed then
    update public.reservas_agent_runs set status='blocked',error_code='context_changed',finished_at=now() where id=v_run.id;
    return jsonb_build_object('ok',true,'status','blocked');
  end if;
  if jsonb_typeof(v_result) is distinct from 'object'
    or coalesce(v_result->>'action','') not in ('draft_message','follow_up','request_human','no_action','book_meeting')
    or coalesce(v_result->>'intent','') not in ('interested','question','objection','meeting','unsubscribe','unknown')
    or length(coalesce(v_result->>'reason','')) not between 1 and 2000
    or jsonb_typeof(v_result->'confidence') is distinct from 'number'
    or (v_result->>'confidence')::numeric not between 0 and 1
    or length(coalesce(v_result->>'draft',''))>2000
    or (v_result->>'intent'='unsubscribe' and v_result->>'action' not in ('request_human','no_action'))
    or (v_result->>'action' in ('draft_message','follow_up') and nullif(btrim(v_result->>'draft'),'') is null) then
    return jsonb_build_object('ok',false,'error','invalid_result');
  end if;
  if v_result->>'action'='book_meeting' and (
    v_result->>'intent'<>'meeting' or jsonb_typeof(v_result->'meeting') is distinct from 'object'
    or public.reservas_valid_timestamp(v_result->'meeting'->>'start') is null
    or public.reservas_valid_timestamp(v_result->'meeting'->>'end') is null
    or public.reservas_valid_timestamp(v_result->'meeting'->>'start')<=now()
    or public.reservas_valid_timestamp(v_result->'meeting'->>'end')<public.reservas_valid_timestamp(v_result->'meeting'->>'start')+interval '15 minutes'
    or public.reservas_valid_timestamp(v_result->'meeting'->>'end')>public.reservas_valid_timestamp(v_result->'meeting'->>'start')+interval '20 minutes'
    or not exists(select 1 from jsonb_array_elements(v_context->'messages') m
      where m->>'id'=v_result->'meeting'->>'evidence_message_id' and m->>'direction'='inbound')
  ) then return jsonb_build_object('ok',false,'error','meeting_evidence_required'); end if;
  update public.reservas_agent_runs set status='review',result=v_result,finished_at=now() where id=v_run.id;
  return jsonb_build_object('ok',true,'status','review','run_id',v_run.id);
exception when invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('ok',false,'error','invalid_payload');
end;
$$;
revoke all on function public.reservas_agent_command(text,jsonb) from public;
grant execute on function public.reservas_agent_command(text,jsonb) to anon,authenticated;

create function public.review_reservas_agent(p_run_id uuid,p_decision text,p_message text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_run public.reservas_agent_runs%rowtype; v_context jsonb;
begin
  if not public.is_internal_member() then raise exception 'not authorized' using errcode='42501'; end if;
  select * into v_run from public.reservas_agent_runs where id=p_run_id for update;
  if not found or v_run.status<>'review' or v_run.approval<>'pending' or p_decision not in ('approved','rejected') then
    return jsonb_build_object('ok',false,'error','invalid_review');
  end if;
  if p_decision='approved' then
    v_context:=public.reservas_agent_context(v_run.prospect_id);
    if v_run.context_version is distinct from v_context->>'context_version'
      or coalesce((v_context->'prospect'->>'do_not_contact')::boolean,true)
      or v_run.result->>'action' not in ('draft_message','follow_up','book_meeting')
      or (v_run.result->>'action'<>'book_meeting' and length(btrim(p_message)) not between 1 and 2000) then
      return jsonb_build_object('ok',false,'error','stale_or_blocked');
    end if;
  end if;
  update public.reservas_agent_runs set approval=p_decision,approved_message=case when p_decision='approved' then btrim(p_message) end,
    decided_by=auth.uid(),decided_at=now() where id=v_run.id;
  return jsonb_build_object('ok',true,'approval',p_decision,'action',v_run.result->>'action');
end;
$$;
revoke all on function public.review_reservas_agent(uuid,text,text) from public;
grant execute on function public.review_reservas_agent(uuid,text,text) to authenticated;

create function public.get_reservas_agent_panel()
returns jsonb language plpgsql stable security invoker set search_path=public as $$
begin
  if not public.is_internal_member() then raise exception 'not authorized' using errcode='42501'; end if;
  return jsonb_build_object('runs',coalesce((select jsonb_agg(to_jsonb(r)) from (
    select r.id,r.prospect_id,r.status,r.result,r.error_code,r.approval,r.approved_message,r.created_at,
      r.appointment_id,r.delivery_state,
      coalesce(o.name,'Alojamiento') as name
    from public.reservas_agent_runs r join public.reservas_prospects p on p.id=r.prospect_id
    join public.leads l on l.id=p.lead_id left join public.organizations o on o.id=l.organization_id
    order by r.created_at desc,r.id desc limit 20
  ) r),'[]'::jsonb),'pending',(select count(*) from public.reservas_agent_runs where status='review' and approval='pending'));
end;
$$;
revoke all on function public.get_reservas_agent_panel() from public;
grant execute on function public.get_reservas_agent_panel() to authenticated;

-- Wakes the same main agent for actual CRM replies, once per inbound message.
create function public.poll_reservas_agent(p_secret text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_candidate record; v_run uuid;
begin
  if not exists(select 1 from public.ingest_config where id=1 and secret=p_secret) then return jsonb_build_object('ok',false,'error','unauthorized'); end if;
  perform pg_advisory_xact_lock(hashtextextended('reservas-agent-poll',0));
  -- Only an exact, unique registered phone can attach an unassigned WhatsApp chat.
  for v_candidate in select c.id as conversation_id,p.id as prospect_id,p.lead_id
    from public.social_conversations c join public.reservas_prospects p
      on regexp_replace(coalesce(c.participant_handle,''),'[^0-9]','','g')=regexp_replace(p.phone_e164,'[^0-9]','','g')
    where c.platform='whatsapp' and c.lead_id is null and not p.do_not_contact
      and (select count(*) from public.reservas_prospects other where other.phone_e164=p.phone_e164)=1
  loop
    update public.social_conversations set lead_id=v_candidate.lead_id where id=v_candidate.conversation_id and lead_id is null;
    if found then insert into public.reservas_prospect_events(prospect_id,source,source_event_id,event_type,actor,occurred_at,details)
      values(v_candidate.prospect_id,'n8n','agent-chat:'||v_candidate.conversation_id,'chat_linked','n8n:reservas-agent',now(),
        jsonb_build_object('conversation_id',v_candidate.conversation_id)) on conflict(source,source_event_id) do nothing; end if;
  end loop;
  select p.id as prospect_id,m.id as message_id into v_candidate
    from public.reservas_prospects p join public.social_conversations c on c.lead_id=p.lead_id and c.platform='whatsapp' and c.status<>'archived'
    join lateral (select id,direction,sent_at from public.social_messages where conversation_id=c.id and deleted_at is null
      and delivery_status in ('sent','delivered','read') order by sent_at desc,id desc limit 1) m on m.direction='inbound'
    where not p.do_not_contact and m.sent_at>=p.created_at
      and exists(select 1 from public.social_messages o where o.conversation_id=c.id and o.direction='outbound'
        and o.deleted_at is null and o.delivery_status in ('sent','delivered','read') and o.sent_at<m.sent_at)
      and not exists(select 1 from public.reservas_agent_runs where source_message_id=m.id)
      and not exists(select 1 from public.reservas_agent_runs where prospect_id=p.id and requested_by is not null and created_at>=m.sent_at)
      and not exists(select 1 from public.reservas_agent_runs where prospect_id=p.id and status in ('queued','running'))
      and coalesce((select event_type from public.reservas_prospect_events where prospect_id=p.id
        and event_type in ('won','lost','meeting_scheduled','meeting_held','meeting_cancelled','proposal_sent')
        order by occurred_at desc,recorded_at desc,id desc limit 1),'') not in ('won','lost')
    order by m.sent_at,p.id limit 1;
  if found then insert into public.reservas_agent_runs(id,prospect_id,source_message_id)
    values(gen_random_uuid(),v_candidate.prospect_id,v_candidate.message_id) on conflict(source_message_id) do nothing; end if;
  select id into v_run from public.reservas_agent_runs where status='queued' order by created_at,id limit 1;
  return jsonb_build_object('ok',true,'run_id',v_run);
end;
$$;
revoke all on function public.poll_reservas_agent(text) from public;
grant execute on function public.poll_reservas_agent(text) to anon,authenticated;
notify pgrst,'reload schema';
