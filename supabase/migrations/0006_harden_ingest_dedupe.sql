-- ============================================================
-- Ingesta n8n: el mismo external_id reutiliza sus relaciones existentes.
-- Evita crear organizaciones huérfanas en cada reintento sin fusionar por
-- nombre (dos empresas distintas pueden llamarse igual).
-- ============================================================
create or replace function public.ingest_lead(p_secret text, p_payload jsonb)
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

  v_name := coalesce(nullif(btrim(p_payload->>'empresa'),''), nullif(btrim(p_payload->>'organization'),''));
  if v_name is null then
    return jsonb_build_object('ok', false, 'error', 'empresa requerida');
  end if;

  v_domain := lower(coalesce(nullif(p_payload->>'web',''), nullif(p_payload->>'domain',''), ''));
  v_domain := regexp_replace(v_domain, '^https?://', '');
  v_domain := regexp_replace(v_domain, '^www\.', '');
  v_domain := nullif(split_part(split_part(v_domain, '/', 1), '?', 1), '');
  v_email := lower(nullif(btrim(p_payload->>'email'),''));
  v_external := nullif(btrim(p_payload->>'external_id'),'');

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
    select id, organization_id, contact_id
      into v_lead_id, v_org_id, v_contact
    from leads
    where external_id = v_external
    limit 1;
  end if;

  if v_org_id is null and v_domain is not null then
    select id into v_org_id
    from organizations
    where lower(domain) = v_domain
    limit 1;
  end if;
  if v_org_id is null then
    insert into organizations (name, domain) values (v_name, v_domain)
    returning id into v_org_id;
  end if;

  if v_contact is null and v_email is not null then
    select id into v_contact from contacts where lower(email) = v_email limit 1;
    if v_contact is null then
      insert into contacts (organization_id, full_name, email, phone)
      values (
        v_org_id,
        coalesce(nullif(p_payload->>'contacto',''), v_email),
        v_email,
        nullif(p_payload->>'phone','')
      )
      returning id into v_contact;
    end if;
  end if;

  if v_lead_id is not null then
    update leads set
      organization_id = v_org_id,
      contact_id = coalesce(v_contact, contact_id),
      segment = coalesce(nullif(p_payload->>'segment',''), segment),
      updated_at = now()
    where id = v_lead_id;
    v_action := 'updated';
  else
    insert into leads (
      organization_id, contact_id, source, service_interest,
      segment, notes, external_id
    )
    values (
      v_org_id, v_contact, v_source::lead_source, v_service::service_type,
      nullif(p_payload->>'segment',''), nullif(p_payload->>'notes',''), v_external
    )
    returning id into v_lead_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', v_action,
    'lead_id', v_lead_id,
    'organization_id', v_org_id
  );
exception when others then
  insert into ingest_errors (payload, error) values (p_payload, sqlerrm);
  -- El detalle queda disponible para internos en ingest_errors; no se expone
  -- al caller anónimo del RPC.
  return jsonb_build_object('ok', false, 'error', 'internal');
end;
$$;

revoke all on function public.ingest_lead(text, jsonb) from public;
grant execute on function public.ingest_lead(text, jsonb) to anon, authenticated;
