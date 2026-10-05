-- Operon Reservas: identidad comercial y eventos, separados del CRM general.
-- Los mensajes pertenecen exclusivamente a social_messages (Zernio).
create table public.reservas_prospects (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leads(id) on delete restrict,
  sheet_id text not null check (sheet_id ~ '^[A-Za-z0-9_-]{1,60}$'),
  sheet_lead_id text not null check (sheet_lead_id ~ '^[A-Za-z0-9_-]{1,60}$'),
  sheet_url text not null check (sheet_url like 'https://docs.google.com/spreadsheets/%'),
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  do_not_contact boolean not null default false,
  suppression_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sheet_id, sheet_lead_id)
);
create index reservas_prospects_phone_idx on public.reservas_prospects(phone_e164);
alter table public.reservas_prospects enable row level security;
create policy reservas_prospects_member_read on public.reservas_prospects
  for select to authenticated using (public.is_internal_member());
-- All writes go through the guarded functions below, including CRM changes.

create table public.reservas_prospect_events (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.reservas_prospects(id) on delete restrict,
  source text not null check (source in ('n8n', 'crm')),
  source_event_id text not null check (length(btrim(source_event_id)) between 1 and 160),
  event_type text not null check (event_type in (
    'prospect_imported', 'chat_linked', 'meeting_scheduled', 'meeting_held',
    'meeting_cancelled', 'proposal_sent', 'won', 'lost', 'suppressed', 'unsuppressed'
  )),
  actor text not null check (length(btrim(actor)) between 1 and 160),
  occurred_at timestamptz not null,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  recorded_at timestamptz not null default now(),
  unique (source, source_event_id)
);
create index reservas_prospect_events_timeline_idx
  on public.reservas_prospect_events(prospect_id, occurred_at, recorded_at);
alter table public.reservas_prospect_events enable row level security;
create policy reservas_prospect_events_member_read on public.reservas_prospect_events
  for select to authenticated using (public.is_internal_member());

create or replace function public.ingest_reservas_prospect(p_secret text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sheet text := nullif(btrim(p_payload->>'sheet_id'), '');
  v_row text := nullif(btrim(p_payload->>'sheet_lead_id'), '');
  v_phone text := '+' || regexp_replace(coalesce(p_payload->>'phone_e164', ''), '[^0-9]', '', 'g');
  v_external text;
  v_lead jsonb;
  v_id uuid;
  v_blocked boolean;
  v_was_blocked boolean;
begin
  if not exists (select 1 from public.ingest_config where id = 1 and secret = p_secret) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  if v_sheet is null or v_sheet !~ '^[A-Za-z0-9_-]{1,60}$'
     or v_row is null or v_row !~ '^[A-Za-z0-9_-]{1,60}$'
     or not starts_with(coalesce(p_payload->>'sheet_url', ''), 'https://docs.google.com/spreadsheets/d/' || v_sheet || '/')
     or coalesce(btrim(p_payload->>'phone_e164'), '') !~ '^\+[0-9 ()-]+$'
     or v_phone !~ '^\+[1-9][0-9]{7,14}$'
     or nullif(btrim(p_payload->>'empresa'), '') is null
     or length(coalesce(p_payload->>'actor', '')) > 160
     or jsonb_typeof(p_payload->'do_not_contact') is distinct from 'boolean' then
    return jsonb_build_object('ok', false, 'error', 'invalid_prospect');
  end if;

  v_external := 'reservas:sheet:' || v_sheet || ':' || v_row;
  -- Un teléfono repetido con otro ID necesita revisión; no fusionar alojamientos
  -- automáticamente ni crear dos fichas silenciosamente para la misma contraparte.
  perform pg_advisory_xact_lock(hashtextextended('reservas:phone:' || v_phone, 0));
  if exists (select 1 from public.reservas_prospects
    where phone_e164 = v_phone and (sheet_id <> v_sheet or sheet_lead_id <> v_row)) then
    return jsonb_build_object('ok', false, 'error', 'identity_conflict');
  end if;
  -- Serializa reintentos del mismo ID; ingest_lead no bloquea por sí solo.
  perform pg_advisory_xact_lock(hashtextextended(v_external, 0));
  select do_not_contact into v_was_blocked from public.reservas_prospects
    where sheet_id = v_sheet and sheet_lead_id = v_row;
  v_lead := public.ingest_lead(p_secret, jsonb_build_object(
    'external_id', v_external, 'empresa', p_payload->>'empresa',
    'phone', v_phone, 'source', 'n8n', 'segment', 'alojamientos',
    'service_interest', 'package'
  ));
  if coalesce(v_lead->>'ok', 'false') <> 'true' then return v_lead; end if;

  insert into public.reservas_prospects
    (lead_id, sheet_id, sheet_lead_id, sheet_url, phone_e164, do_not_contact, suppression_reason)
  values
    ((v_lead->>'lead_id')::uuid, v_sheet, v_row, p_payload->>'sheet_url', v_phone,
     (p_payload->>'do_not_contact')::boolean,
     case when (p_payload->>'do_not_contact')::boolean then nullif(btrim(p_payload->>'suppression_reason'), '') end)
  on conflict (sheet_id, sheet_lead_id) do update set
    sheet_url = excluded.sheet_url,
    phone_e164 = excluded.phone_e164,
    do_not_contact = public.reservas_prospects.do_not_contact or excluded.do_not_contact,
    suppression_reason = case when excluded.do_not_contact then
      coalesce(excluded.suppression_reason, public.reservas_prospects.suppression_reason)
      else public.reservas_prospects.suppression_reason end,
    updated_at = now()
  returning id, do_not_contact into v_id, v_blocked;

  update public.leads set source_url = p_payload->>'sheet_url'
    where id = (v_lead->>'lead_id')::uuid;
  insert into public.reservas_prospect_events
    (prospect_id, source, source_event_id, event_type, actor, occurred_at)
  values (v_id, 'n8n', 'import:' || v_external, 'prospect_imported',
          coalesce(nullif(btrim(p_payload->>'actor'), ''), 'n8n:sheet-importer'), now())
  on conflict (source, source_event_id) do nothing;
  if (p_payload->>'do_not_contact')::boolean and not coalesce(v_was_blocked, false) then
    insert into public.reservas_prospect_events
      (prospect_id, source, source_event_id, event_type, actor, occurred_at, details)
    values (v_id, 'n8n', 'import-suppression:' || gen_random_uuid()::text, 'suppressed',
      coalesce(nullif(btrim(p_payload->>'actor'), ''), 'n8n:sheet-importer'), now(),
      jsonb_build_object('reason', nullif(btrim(p_payload->>'suppression_reason'), '')))
    on conflict (source, source_event_id) do nothing;
  end if;
  return jsonb_build_object('ok', true, 'action', v_lead->>'action',
    'lead_id', v_lead->>'lead_id', 'prospect_id', v_id, 'do_not_contact', v_blocked);
end;
$$;
revoke all on function public.ingest_reservas_prospect(text, jsonb) from public;
grant execute on function public.ingest_reservas_prospect(text, jsonb) to anon, authenticated;

create or replace function public.ingest_reservas_event(p_secret text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_prospect public.reservas_prospects%rowtype;
  v_type text := p_payload->>'event_type';
  v_event_id text := nullif(btrim(p_payload->>'event_id'), '');
  v_occurred timestamptz;
  v_id uuid;
begin
  if not exists (select 1 from public.ingest_config where id = 1 and secret = p_secret) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  -- WhatsApp replies and sent messages must come from Zernio, never this RPC.
  if coalesce(v_type, '') not in ('meeting_scheduled', 'meeting_held', 'meeting_cancelled',
                    'proposal_sent', 'won', 'lost', 'suppressed')
     or v_event_id is null or length(v_event_id) > 160
     or nullif(btrim(p_payload->>'actor'), '') is null
     or length(p_payload->>'actor') > 160
     or jsonb_typeof(p_payload->'details') is distinct from 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_event');
  end if;
  if coalesce(p_payload->>'occurred_at', '') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_timestamp');
  end if;
  begin
    v_occurred := (p_payload->>'occurred_at')::timestamptz;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'invalid_timestamp');
  end;
  if v_occurred is null or v_occurred > now() + interval '5 minutes' then
    return jsonb_build_object('ok', false, 'error', 'invalid_timestamp');
  end if;
  select * into v_prospect from public.reservas_prospects
    where id = (p_payload->>'prospect_id')::uuid for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform pg_advisory_xact_lock(hashtextextended('reservas:n8n:event:' || v_event_id, 0));
  select id into v_id from public.reservas_prospect_events
    where source = 'n8n' and source_event_id = v_event_id
      and prospect_id = v_prospect.id and event_type = v_type
      and actor = p_payload->>'actor'
      and occurred_at = v_occurred and details = p_payload->'details';
  if v_id is not null then return jsonb_build_object('ok', true, 'status', 'duplicate', 'event_id', v_id); end if;
  if exists (select 1 from public.reservas_prospect_events
    where source = 'n8n' and source_event_id = v_event_id) then
    return jsonb_build_object('ok', false, 'error', 'event_id_conflict');
  end if;
  insert into public.reservas_prospect_events
    (prospect_id, source, source_event_id, event_type, actor, occurred_at, details)
  values (v_prospect.id, 'n8n', v_event_id, v_type, p_payload->>'actor',
          v_occurred, p_payload->'details') returning id into v_id;
  if v_type = 'suppressed' then
    update public.reservas_prospects set do_not_contact = true,
      suppression_reason = coalesce(nullif(btrim(p_payload->'details'->>'reason'), ''), 'Solicitud de no contacto'),
      updated_at = now() where id = v_prospect.id;
  end if;
  return jsonb_build_object('ok', true, 'status', 'created', 'event_id', v_id);
exception when invalid_text_representation then
  return jsonb_build_object('ok', false, 'error', 'invalid_prospect_id');
end;
$$;
revoke all on function public.ingest_reservas_event(text, jsonb) from public;
grant execute on function public.ingest_reservas_event(text, jsonb) to anon, authenticated;

create or replace function public.record_reservas_event(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_prospect public.reservas_prospects%rowtype;
  v_type text := p_payload->>'event_type';
  v_event_id text := nullif(btrim(p_payload->>'event_id'), '');
  v_occurred timestamptz;
  v_id uuid;
begin
  if not public.is_internal_member() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if coalesce(v_type, '') not in ('meeting_scheduled', 'meeting_held', 'meeting_cancelled',
                    'proposal_sent', 'won', 'lost', 'suppressed', 'unsuppressed')
     or v_event_id is null or length(v_event_id) > 160
     or jsonb_typeof(p_payload->'details') is distinct from 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_event');
  end if;
  if coalesce(p_payload->>'occurred_at', '') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_timestamp');
  end if;
  begin
    v_occurred := (p_payload->>'occurred_at')::timestamptz;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'invalid_timestamp');
  end;
  if v_occurred is null or v_occurred > now() + interval '5 minutes' then
    return jsonb_build_object('ok', false, 'error', 'invalid_timestamp');
  end if;
  select * into v_prospect from public.reservas_prospects
    where id = (p_payload->>'prospect_id')::uuid for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform pg_advisory_xact_lock(hashtextextended('reservas:crm:event:' || v_event_id, 0));
  select id into v_id from public.reservas_prospect_events
    where source = 'crm' and source_event_id = v_event_id
      and prospect_id = v_prospect.id and event_type = v_type
      and actor = 'crm:' || auth.uid()::text
      and occurred_at = v_occurred and details = p_payload->'details';
  if v_id is not null then return jsonb_build_object('ok', true, 'status', 'duplicate', 'event_id', v_id); end if;
  if exists (select 1 from public.reservas_prospect_events
    where source = 'crm' and source_event_id = v_event_id) then
    return jsonb_build_object('ok', false, 'error', 'event_id_conflict');
  end if;
  if v_type = 'unsuppressed' and nullif(btrim(p_payload->'details'->>'reason'), '') is null then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  insert into public.reservas_prospect_events
    (prospect_id, source, source_event_id, event_type, actor, occurred_at, details)
  values (v_prospect.id, 'crm', v_event_id, v_type, 'crm:' || auth.uid()::text,
          v_occurred, p_payload->'details') returning id into v_id;
  if v_type in ('suppressed', 'unsuppressed') then
    update public.reservas_prospects set
      do_not_contact = (v_type = 'suppressed'),
      suppression_reason = case when v_type = 'suppressed' then
        coalesce(nullif(btrim(p_payload->'details'->>'reason'), ''), 'Solicitud de no contacto')
        else null end,
      updated_at = now() where id = v_prospect.id;
  end if;
  return jsonb_build_object('ok', true, 'status', 'created', 'event_id', v_id);
exception when invalid_text_representation then
  return jsonb_build_object('ok', false, 'error', 'invalid_prospect_id');
end;
$$;
revoke all on function public.record_reservas_event(jsonb) from public;
grant execute on function public.record_reservas_event(jsonb) to authenticated;

create or replace function public.link_reservas_conversation(p_prospect_id uuid, p_conversation_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_lead_id uuid; v_existing uuid; v_platform text;
begin
  if not public.is_internal_member() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select lead_id into v_lead_id from public.reservas_prospects where id = p_prospect_id;
  if v_lead_id is null then return jsonb_build_object('ok', false, 'error', 'prospect_not_found'); end if;
  select lead_id, platform into v_existing, v_platform from public.social_conversations
    where id = p_conversation_id for update;
  if not found or v_platform <> 'whatsapp' or (v_existing is not null and v_existing <> v_lead_id) then
    return jsonb_build_object('ok', false, 'error', 'conversation_conflict');
  end if;
  update public.social_conversations set lead_id = v_lead_id where id = p_conversation_id;
  insert into public.reservas_prospect_events
    (prospect_id, source, source_event_id, event_type, actor, occurred_at, details)
  values (p_prospect_id, 'crm', 'chat:' || p_conversation_id::text, 'chat_linked',
    'crm:' || auth.uid()::text, now(), jsonb_build_object('conversation_id', p_conversation_id))
  on conflict (source, source_event_id) do nothing;
  return jsonb_build_object('ok', true, 'lead_id', v_lead_id);
end;
$$;
revoke all on function public.link_reservas_conversation(uuid, uuid) from public;
grant execute on function public.link_reservas_conversation(uuid, uuid) to authenticated;

create or replace function public.reservas_contact_blocked(p_lead_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case when public.is_internal_member() then
    exists (select 1 from public.reservas_prospects where lead_id = p_lead_id and do_not_contact)
    else true end;
$$;
revoke all on function public.reservas_contact_blocked(uuid) from public;
grant execute on function public.reservas_contact_blocked(uuid) to authenticated;

create or replace function public.get_reservas_contact_state(p_secret text, p_prospect_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_prospect public.reservas_prospects%rowtype;
begin
  if not exists (select 1 from public.ingest_config where id = 1 and secret = p_secret) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  select * into v_prospect from public.reservas_prospects where id = p_prospect_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'prospect_id', v_prospect.id,
    'lead_id', v_prospect.lead_id, 'phone_e164', v_prospect.phone_e164,
    'do_not_contact', v_prospect.do_not_contact, 'updated_at', v_prospect.updated_at);
end;
$$;
revoke all on function public.get_reservas_contact_state(text, uuid) from public;
grant execute on function public.get_reservas_contact_state(text, uuid) to anon, authenticated;
