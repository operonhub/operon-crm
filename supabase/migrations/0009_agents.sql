-- ============================================================
-- Operon CRM — catálogo y control de agentes
-- No incluye runner ni credenciales. Toda métrica se deriva de ejecuciones
-- y aprobaciones efectivamente registradas.
-- ============================================================

do $$ begin
  create type public.agent_status as enum ('draft', 'active', 'paused', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.agent_run_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.agent_approval_status as enum ('pending', 'approved', 'rejected', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  purpose text,
  instructions text,
  status public.agent_status not null default 'draft',
  owner_id uuid references public.profiles(id),
  tools text[] not null default '{}',
  channels text[] not null default '{}',
  allowed_actions text[] not null default '{}',
  approval_required_actions text[] not null default '{}',
  prohibited_actions text[] not null default array[
    'payments', 'delete_records', 'credentials', 'mass_messaging', 'deploy', 'permissions'
  ]::text[],
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  constraint agents_no_secret_tools check (
    array_to_string(tools, ' ') !~* '(api[_ -]?key|password|secret|token|credential)'
  ),
  constraint agents_no_secret_instructions check (
    coalesce(instructions, '') !~* '(sk-[a-z0-9]{16,}|bearer[[:space:]]+[a-z0-9._-]{16,})'
  )
);

create table if not exists public.project_agents (
  project_id uuid not null references public.projects(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete restrict,
  responsibility text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  primary key (project_id, agent_id)
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete restrict,
  project_id uuid references public.projects(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  status public.agent_run_status not null default 'queued',
  trigger_kind text not null default 'manual'
    check (trigger_kind in ('manual', 'scheduled', 'webhook', 'system')),
  input_summary text,
  output_summary text,
  error_code text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  initiated_by uuid references public.profiles(id),
  constraint agent_runs_time_order check (
    finished_at is null or started_at is null or finished_at >= started_at
  ),
  constraint agent_runs_error_consistency check (
    status = 'failed' or (error_code is null and error_message is null)
  )
);

create table if not exists public.agent_approvals (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete restrict,
  run_id uuid references public.agent_runs(id) on delete set null,
  action_type text not null check (action_type in (
    'send_message', 'publish', 'important_data_change',
    'campaign_change', 'configuration_change', 'external_action'
  )),
  action_summary text not null check (length(btrim(action_summary)) between 1 and 300),
  rationale text,
  status public.agent_approval_status not null default 'pending',
  requested_at timestamptz not null default now(),
  requested_by uuid references public.profiles(id),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id),
  decision_note text,
  constraint agent_approval_decision_consistency check (
    (status = 'pending' and decided_at is null and decided_by is null)
    or
    (status <> 'pending' and decided_at is not null and decided_by is not null)
  )
);

create index if not exists agents_status_idx
  on public.agents (status, updated_at desc);
create index if not exists agents_owner_idx
  on public.agents (owner_id, status);
create index if not exists project_agents_agent_idx
  on public.project_agents (agent_id, project_id);
create index if not exists agent_runs_agent_created_idx
  on public.agent_runs (agent_id, created_at desc);
create index if not exists agent_runs_status_idx
  on public.agent_runs (status, created_at desc);
create index if not exists agent_approvals_pending_idx
  on public.agent_approvals (requested_at desc)
  where status = 'pending';

drop trigger if exists agents_set_updated_at on public.agents;
create trigger agents_set_updated_at
  before update on public.agents
  for each row execute function public.set_updated_at();
drop trigger if exists agents_set_created_by on public.agents;
create trigger agents_set_created_by
  before insert on public.agents
  for each row execute function public.set_created_by();
drop trigger if exists project_agents_set_created_by on public.project_agents;
create trigger project_agents_set_created_by
  before insert on public.project_agents
  for each row execute function public.set_created_by();

-- La decisión siempre queda atribuida al actor administrador.
create or replace function public.normalize_agent_approval_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if old.status <> 'pending' then
      raise exception 'Una aprobación decidida no puede reabrirse.';
    end if;
    if new.status not in ('approved', 'rejected', 'cancelled') then
      raise exception 'Estado de aprobación inválido.';
    end if;
    new.decided_at := now();
    new.decided_by := auth.uid();
  end if;
  return new;
end;
$$;

revoke execute on function public.normalize_agent_approval_decision() from public, anon, authenticated;

drop trigger if exists agent_approvals_normalize_decision on public.agent_approvals;
create trigger agent_approvals_normalize_decision
  before update on public.agent_approvals
  for each row execute function public.normalize_agent_approval_decision();

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['agents', 'project_agents', 'agent_runs', 'agent_approvals'] loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

drop policy if exists "agents_read" on public.agents;
drop policy if exists "agents_admin_insert" on public.agents;
drop policy if exists "agents_admin_update" on public.agents;
create policy "agents_read" on public.agents
  for select to authenticated using (public.is_internal_member());
create policy "agents_admin_insert" on public.agents
  for insert to authenticated with check (public.is_internal_admin());
create policy "agents_admin_update" on public.agents
  for update to authenticated
  using (public.is_internal_admin()) with check (public.is_internal_admin());

drop policy if exists "project_agents_read" on public.project_agents;
drop policy if exists "project_agents_admin_insert" on public.project_agents;
drop policy if exists "project_agents_admin_update" on public.project_agents;
drop policy if exists "project_agents_admin_delete" on public.project_agents;
create policy "project_agents_read" on public.project_agents
  for select to authenticated using (public.is_internal_member());
create policy "project_agents_admin_insert" on public.project_agents
  for insert to authenticated with check (public.is_internal_admin());
create policy "project_agents_admin_update" on public.project_agents
  for update to authenticated
  using (public.is_internal_admin()) with check (public.is_internal_admin());
create policy "project_agents_admin_delete" on public.project_agents
  for delete to authenticated using (public.is_internal_admin());

drop policy if exists "agent_runs_read" on public.agent_runs;
drop policy if exists "agent_runs_admin_insert" on public.agent_runs;
drop policy if exists "agent_runs_admin_update" on public.agent_runs;
create policy "agent_runs_read" on public.agent_runs
  for select to authenticated using (public.is_internal_member());
create policy "agent_runs_admin_insert" on public.agent_runs
  for insert to authenticated with check (public.is_internal_admin());
create policy "agent_runs_admin_update" on public.agent_runs
  for update to authenticated
  using (public.is_internal_admin()) with check (public.is_internal_admin());

drop policy if exists "agent_approvals_read" on public.agent_approvals;
drop policy if exists "agent_approvals_admin_insert" on public.agent_approvals;
drop policy if exists "agent_approvals_admin_update" on public.agent_approvals;
create policy "agent_approvals_read" on public.agent_approvals
  for select to authenticated using (public.is_internal_member());
create policy "agent_approvals_admin_insert" on public.agent_approvals
  for insert to authenticated with check (public.is_internal_admin());
create policy "agent_approvals_admin_update" on public.agent_approvals
  for update to authenticated
  using (public.is_internal_admin()) with check (public.is_internal_admin());

grant select, insert, update on public.agents to authenticated;
grant select, insert, update, delete on public.project_agents to authenticated;
grant select, insert, update on public.agent_runs to authenticated;
grant select, insert, update on public.agent_approvals to authenticated;

notify pgrst, 'reload schema';
