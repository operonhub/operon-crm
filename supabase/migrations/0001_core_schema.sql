-- ============================================================
-- Operon CRM — Esquema núcleo P0
-- ============================================================
create extension if not exists "pgcrypto";

-- ---------- Enums ----------
create type user_role         as enum ('admin','operador');
create type lead_source       as enum ('scraping','lista_manual','referido','formulario','campana','inbound','n8n','otro');
create type service_type      as enum ('landing_page','automation','lead_generation','package');
create type lead_status       as enum ('nuevo','calificado','descartado','convertido');
create type opportunity_stage as enum ('nuevo','por_investigar','contactado','respondio','reunion_agendada','diagnostico_propuesta','negociacion','ganado','perdido','no_califica');
create type activity_type     as enum ('nota','llamada','email','reunion','tarea');
create type project_status    as enum ('discovery','en_progreso','revision','entregado','activo','pausado','cerrado');
create type task_status       as enum ('pendiente','en_progreso','bloqueada','completada');
create type priority_level    as enum ('baja','media','alta','urgente');
create type client_status     as enum ('activo','pausado','finalizado');
create type automation_env    as enum ('produccion','staging','desarrollo');
create type automation_status as enum ('discovery','construccion','activo','pausado','monitoreo');

-- ---------- profiles (usuarios internos) ----------
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null default '',
  email      text,
  role       user_role not null default 'operador',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- organizations ----------
create table organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  website    text,
  domain     text,               -- normalizado para dedupe
  industry   text,
  size       text,
  country    text,
  city       text,
  linkedin   text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);
create index organizations_domain_idx on organizations (lower(domain));

-- ---------- contacts ----------
create table contacts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete set null,
  full_name       text not null,
  title           text,
  email           text,
  phone           text,
  linkedin        text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references profiles(id)
);
create index contacts_org_idx   on contacts (organization_id);
create index contacts_email_idx on contacts (lower(email));

-- ---------- campaigns ----------
create table campaigns (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  channel    text,
  segment    text,
  goal       text,
  starts_on  date,
  ends_on    date,
  cost       numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

-- ---------- leads ----------
create table leads (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references organizations(id) on delete set null,
  contact_id       uuid references contacts(id) on delete set null,
  campaign_id      uuid references campaigns(id) on delete set null,
  source           lead_source not null default 'lista_manual',
  source_url       text,
  service_interest service_type,
  segment          text,
  status           lead_status not null default 'nuevo',
  owner_id         uuid references profiles(id),
  notes            text,
  external_id      text,          -- idempotencia n8n
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references profiles(id)
);
create index leads_status_idx on leads (status);
create index leads_owner_idx  on leads (owner_id);
create unique index leads_external_id_uidx on leads (external_id) where external_id is not null;

-- ---------- opportunities ----------
create table opportunities (
  id                  uuid primary key default gen_random_uuid(),
  lead_id             uuid references leads(id) on delete set null,
  organization_id     uuid references organizations(id) on delete set null,
  contact_id          uuid references contacts(id) on delete set null,
  title               text not null,
  stage               opportunity_stage not null default 'nuevo',
  service_type        service_type,
  estimated_value     numeric(12,2),
  currency            text not null default 'USD',
  probability         int check (probability between 0 and 100),
  expected_close_date date,
  next_action         text,
  next_action_date    date,
  owner_id            uuid references profiles(id),
  lost_reason         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references profiles(id)
);
create index opportunities_stage_idx       on opportunities (stage);
create index opportunities_owner_idx       on opportunities (owner_id);
create index opportunities_next_action_idx on opportunities (next_action_date);

-- ---------- clients ----------
create table clients (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete set null,
  opportunity_id  uuid references opportunities(id) on delete set null,
  status          client_status not null default 'activo',
  start_date      date default now(),
  owner_id        uuid references profiles(id),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references profiles(id)
);

-- ---------- projects ----------
create table projects (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid references clients(id) on delete cascade,
  opportunity_id  uuid references opportunities(id) on delete set null,
  name            text not null,
  type            service_type not null,
  status          project_status not null default 'discovery',
  scope           text,
  conversion_goal text,   -- landing pages
  kpi             text,   -- automatizaciones
  owner_id        uuid references profiles(id),
  start_date      date,
  due_date        date,
  links           jsonb not null default '{}'::jsonb,  -- figma, repo, staging, prod, analytics
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references profiles(id)
);
create index projects_client_idx on projects (client_id);
create index projects_status_idx on projects (status);

-- ---------- project_tasks ----------
create table project_tasks (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title      text not null,
  status     task_status not null default 'pendiente',
  priority   priority_level not null default 'media',
  owner_id   uuid references profiles(id),
  due_date   date,
  position   int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);
create index project_tasks_project_idx on project_tasks (project_id);

-- ---------- automations (referencia a n8n; NUNCA secretos en texto) ----------
create table automations (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid references projects(id) on delete cascade,
  name            text not null,
  n8n_workflow_id text,
  n8n_url         text,
  environment     automation_env not null default 'produccion',
  status          automation_status not null default 'discovery',
  trigger         text,
  last_result     text,
  last_run_at     timestamptz,
  secret_ref      text,   -- SOLO etiqueta/referencia del secreto, jamás el valor
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references profiles(id)
);

-- ---------- activities (historial + tareas de seguimiento) ----------
create table activities (
  id             uuid primary key default gen_random_uuid(),
  type           activity_type not null default 'nota',
  body           text,
  opportunity_id uuid references opportunities(id) on delete cascade,
  contact_id     uuid references contacts(id) on delete set null,
  project_id     uuid references projects(id) on delete cascade,
  due_date       date,
  completed      boolean not null default false,
  completed_at   timestamptz,
  owner_id       uuid references profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references profiles(id)
);
create index activities_opportunity_idx on activities (opportunity_id);
create index activities_project_idx     on activities (project_id);
create index activities_due_idx         on activities (due_date) where completed = false;

-- ---------- audit_log (trazabilidad simple) ----------
create table audit_log (
  id         bigint generated always as identity primary key,
  user_id    uuid references profiles(id),
  entity     text not null,
  entity_id  uuid,
  action     text not null,
  metadata   jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Triggers: updated_at + created_by automáticos
-- ============================================================
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create or replace function set_created_by() returns trigger
language plpgsql as $$
begin
  if new.created_by is null then new.created_by = auth.uid(); end if;
  return new;
end; $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','organizations','contacts','campaigns','leads',
                           'opportunities','clients','projects','project_tasks',
                           'automations','activities'] loop
    execute format('create trigger %I_set_updated_at before update on public.%I
                    for each row execute function set_updated_at();', t, t);
  end loop;

  foreach t in array array['organizations','contacts','campaigns','leads',
                           'opportunities','clients','projects','project_tasks',
                           'automations','activities'] loop
    execute format('create trigger %I_set_created_by before insert on public.%I
                    for each row execute function set_created_by();', t, t);
  end loop;
end $$;
