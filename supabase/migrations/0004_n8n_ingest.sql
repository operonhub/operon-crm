-- ============================================================
-- Ingesta n8n: config de secreto, log de errores y función idempotente
-- ============================================================

-- Secreto de ingesta (solo lo lee la función SECURITY DEFINER)
create table ingest_config (
  id     int primary key default 1,
  secret text not null,
  constraint ingest_config_single_row check (id = 1)
);
alter table ingest_config enable row level security;
-- sin políticas: ni anon ni authenticated pueden leerlo por API

-- IMPORTANTE: reemplazar el secreto por uno propio en cada entorno.
--   insert into ingest_config (id, secret) values (1, '<secreto>');
insert into ingest_config (id, secret)
values (1, 'CAMBIAR_ESTE_SECRETO')
on conflict (id) do nothing;

-- Log de errores de ingesta (visible para internos)
create table ingest_errors (
  id         bigint generated always as identity primary key,
  payload    jsonb,
  error      text not null,
  created_at timestamptz not null default now()
);
alter table ingest_errors enable row level security;
create policy "internal_all" on ingest_errors
  for all to authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- ingest_lead: crea/actualiza un lead de forma idempotente (external_id).
-- Verifica el secreto internamente; deduplica org por dominio y contacto
-- por email. Registra fallos inesperados en ingest_errors.
-- ------------------------------------------------------------
create or replace function ingest_lead(p_secret text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret   text;
  v_name     text;
  v_domain   text;
  v_email    text;
  v_external text;
  v_source   text;
  v_service  text;
  v_org_id   uuid;
  v_contact  uuid;
  v_lead_id  uuid;
  v_action   text := 'created';
begin
  select secret into v_secret from ingest_config where id = 1;
  if v_secret is null or p_secret is distinct from v_secret then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  v_name := coalesce(nullif(p_payload->>'empresa',''), nullif(p_payload->>'organization',''));
  if v_name is null then
    return jsonb_build_object('ok', false, 'error', 'empresa requerida');
  end if;

  v_domain := lower(coalesce(nullif(p_payload->>'web',''), nullif(p_payload->>'domain',''), ''));
  v_domain := regexp_replace(v_domain, '^https?://', '');
  v_domain := regexp_replace(v_domain, '^www\.', '');
  v_domain := nullif(split_part(split_part(v_domain, '/', 1), '?', 1), '');

  v_email    := lower(nullif(p_payload->>'email',''));
  v_external := nullif(p_payload->>'external_id','');

  v_source := lower(coalesce(nullif(p_payload->>'source',''), 'n8n'));
  if v_source not in (select unnest(enum_range(null::lead_source))::text) then
    v_source := 'n8n';
  end if;
  v_service := lower(nullif(p_payload->>'service_interest',''));
  if v_service is not null
     and v_service not in (select unnest(enum_range(null::service_type))::text) then
    v_service := null;
  end if;

  if v_external is not null then
    select id into v_lead_id from leads where external_id = v_external limit 1;
  end if;

  if v_domain is not null then
    select id into v_org_id from organizations where lower(domain) = v_domain limit 1;
  end if;
  if v_org_id is null then
    insert into organizations (name, domain) values (v_name, v_domain)
    returning id into v_org_id;
  end if;

  if v_email is not null then
    select id into v_contact from contacts where lower(email) = v_email limit 1;
    if v_contact is null then
      insert into contacts (organization_id, full_name, email, phone)
      values (v_org_id,
              coalesce(nullif(p_payload->>'contacto',''), v_email),
              v_email,
              nullif(p_payload->>'phone',''))
      returning id into v_contact;
    end if;
  end if;

  if v_lead_id is not null then
    update leads set
      organization_id = v_org_id,
      contact_id      = coalesce(v_contact, contact_id),
      segment         = coalesce(nullif(p_payload->>'segment',''), segment),
      updated_at      = now()
    where id = v_lead_id;
    v_action := 'updated';
  else
    insert into leads (organization_id, contact_id, source, service_interest,
                       segment, notes, external_id)
    values (v_org_id, v_contact, v_source::lead_source,
            v_service::service_type,
            nullif(p_payload->>'segment',''),
            nullif(p_payload->>'notes',''),
            v_external)
    returning id into v_lead_id;
  end if;

  return jsonb_build_object('ok', true, 'action', v_action,
                            'lead_id', v_lead_id, 'organization_id', v_org_id);
exception when others then
  insert into ingest_errors (payload, error) values (p_payload, sqlerrm);
  return jsonb_build_object('ok', false, 'error', 'internal', 'detail', sqlerrm);
end;
$$;

revoke all on function ingest_lead(text, jsonb) from public;
grant execute on function ingest_lead(text, jsonb) to anon, authenticated;
