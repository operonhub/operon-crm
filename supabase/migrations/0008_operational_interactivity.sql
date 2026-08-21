-- ============================================================
-- Operon CRM — interactividad operativa
-- Migración aditiva: archivado, colaboración en proyectos,
-- tareas editables y finanzas con pagos parciales inmutables.
-- ============================================================

-- ---------- Helpers de autorización ----------
create or replace function public.is_internal_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid()
  );
$$;

create or replace function public.is_internal_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke execute on function public.is_internal_member() from public, anon;
revoke execute on function public.is_internal_admin() from public, anon;
grant execute on function public.is_internal_member() to authenticated;
grant execute on function public.is_internal_admin() to authenticated;

-- ---------- Archivado seguro ----------
alter table public.clients
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id),
  add column if not exists archive_reason text;

alter table public.projects
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id),
  add column if not exists archive_reason text;

create index if not exists clients_active_idx
  on public.clients (status, created_at desc)
  where archived_at is null;
create index if not exists projects_active_area_idx
  on public.projects (area, status, due_date)
  where archived_at is null;

create or replace function public.guard_admin_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.archived_at is distinct from old.archived_at
     and not public.is_internal_admin() then
    raise exception 'Solo un administrador puede archivar o restaurar registros.';
  end if;
  if new.archived_at is not null and new.archived_by is null then
    new.archived_by := auth.uid();
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_admin_archive() from public, anon, authenticated;

drop trigger if exists clients_guard_admin_archive on public.clients;
create trigger clients_guard_admin_archive
  before update on public.clients
  for each row execute function public.guard_admin_archive();

drop trigger if exists projects_guard_admin_archive on public.projects;
create trigger projects_guard_admin_archive
  before update on public.projects
  for each row execute function public.guard_admin_archive();

-- ---------- Proyectos: colaboradores, hitos y bloqueos ----------
create table if not exists public.project_collaborators (
  project_id uuid not null references public.projects(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  responsibility text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  primary key (project_id, profile_id)
);

create table if not exists public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 160),
  description text,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  due_date date,
  completed_at timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table if not exists public.project_blockers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  detail text,
  status text not null default 'open'
    check (status in ('open', 'resolved')),
  owner_id uuid references public.profiles(id),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create index if not exists project_collaborators_profile_idx
  on public.project_collaborators (profile_id, project_id);
create index if not exists project_milestones_project_idx
  on public.project_milestones (project_id, position, due_date);
create index if not exists project_blockers_open_idx
  on public.project_blockers (project_id, created_at desc)
  where status = 'open';

alter table public.project_tasks
  add column if not exists description text,
  add column if not exists completed_at timestamptz,
  add column if not exists archived_at timestamptz;

create index if not exists project_tasks_board_idx
  on public.project_tasks (project_id, archived_at, position, due_date);

-- ---------- Finanzas: pagos e historial ----------
alter table public.financial_records
  add column if not exists updated_by uuid references public.profiles(id),
  add column if not exists canceled_by uuid references public.profiles(id),
  add column if not exists cancel_reason text;

create table if not exists public.financial_payments (
  id uuid primary key default gen_random_uuid(),
  financial_record_id uuid not null references public.financial_records(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  paid_on date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table if not exists public.financial_record_history (
  id bigint generated always as identity primary key,
  financial_record_id uuid not null references public.financial_records(id) on delete restrict,
  change_type text not null check (change_type in ('created', 'updated', 'payment', 'cancelled')),
  previous_data jsonb,
  next_data jsonb,
  note text,
  changed_at timestamptz not null default now(),
  changed_by uuid references public.profiles(id)
);

create index if not exists financial_payments_record_idx
  on public.financial_payments (financial_record_id, paid_on desc, created_at desc);
create index if not exists financial_history_record_idx
  on public.financial_record_history (financial_record_id, changed_at desc);

-- Convierte importes pagados previos a la migración en una primera fila de
-- historial. El registro financiero original no cambia.
insert into public.financial_payments (
  financial_record_id, amount, paid_on, note, created_by
)
select
  fr.id,
  fr.paid_amount,
  coalesce(fr.paid_at, fr.created_at::date),
  'Saldo histórico previo a pagos detallados',
  fr.created_by
from public.financial_records fr
where fr.paid_amount > 0
  and not exists (
    select 1 from public.financial_payments fp
    where fp.financial_record_id = fr.id
  );

create or replace function public.prevent_financial_payment_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Los pagos son inmutables. Registrá un ajuste en el movimiento financiero.';
end;
$$;

drop trigger if exists financial_payments_immutable on public.financial_payments;
create trigger financial_payments_immutable
  before update or delete on public.financial_payments
  for each row execute function public.prevent_financial_payment_mutation();

create or replace function public.apply_financial_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.financial_records%rowtype;
  v_new_paid numeric(14,2);
begin
  select * into v_record
  from public.financial_records
  where id = new.financial_record_id
  for update;

  if not found then
    raise exception 'Movimiento financiero inexistente.';
  end if;
  if v_record.canceled_at is not null then
    raise exception 'No se pueden cargar pagos en un movimiento cancelado.';
  end if;

  select coalesce(sum(amount), 0) into v_new_paid
  from public.financial_payments
  where financial_record_id = new.financial_record_id;

  if v_new_paid > v_record.total_amount then
    raise exception 'El pago supera el saldo pendiente.';
  end if;

  update public.financial_records
  set paid_amount = v_new_paid,
      paid_at = case when v_new_paid >= total_amount then new.paid_on else null end,
      updated_by = auth.uid()
  where id = new.financial_record_id;

  insert into public.financial_record_history (
    financial_record_id, change_type, next_data, note, changed_by
  ) values (
    new.financial_record_id,
    'payment',
    jsonb_build_object('payment_id', new.id, 'amount', new.amount, 'paid_on', new.paid_on),
    new.note,
    coalesce(new.created_by, auth.uid())
  );

  return new;
end;
$$;

revoke execute on function public.apply_financial_payment() from public, anon, authenticated;

drop trigger if exists financial_payments_apply on public.financial_payments;
create trigger financial_payments_apply
  after insert on public.financial_payments
  for each row execute function public.apply_financial_payment();

create or replace function public.track_financial_record_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Los cambios de paid_amount quedan registrados por el trigger del pago.
  if to_jsonb(new) - array['paid_amount','paid_at','updated_at','updated_by']::text[]
     is distinct from
     to_jsonb(old) - array['paid_amount','paid_at','updated_at','updated_by']::text[] then
    insert into public.financial_record_history (
      financial_record_id,
      change_type,
      previous_data,
      next_data,
      note,
      changed_by
    ) values (
      new.id,
      case when old.canceled_at is null and new.canceled_at is not null
        then 'cancelled' else 'updated' end,
      to_jsonb(old),
      to_jsonb(new),
      new.cancel_reason,
      coalesce(new.updated_by, new.canceled_by, auth.uid())
    );
  end if;
  return new;
end;
$$;

revoke execute on function public.track_financial_record_change() from public, anon, authenticated;

drop trigger if exists financial_records_track_change on public.financial_records;
create trigger financial_records_track_change
  after update on public.financial_records
  for each row execute function public.track_financial_record_change();

-- ---------- Triggers estándar ----------
drop trigger if exists project_milestones_set_updated_at on public.project_milestones;
create trigger project_milestones_set_updated_at
  before update on public.project_milestones
  for each row execute function public.set_updated_at();
drop trigger if exists project_milestones_set_created_by on public.project_milestones;
create trigger project_milestones_set_created_by
  before insert on public.project_milestones
  for each row execute function public.set_created_by();

drop trigger if exists project_blockers_set_updated_at on public.project_blockers;
create trigger project_blockers_set_updated_at
  before update on public.project_blockers
  for each row execute function public.set_updated_at();
drop trigger if exists project_blockers_set_created_by on public.project_blockers;
create trigger project_blockers_set_created_by
  before insert on public.project_blockers
  for each row execute function public.set_created_by();

drop trigger if exists project_collaborators_set_created_by on public.project_collaborators;
create trigger project_collaborators_set_created_by
  before insert on public.project_collaborators
  for each row execute function public.set_created_by();
drop trigger if exists financial_payments_set_created_by on public.financial_payments;
create trigger financial_payments_set_created_by
  before insert on public.financial_payments
  for each row execute function public.set_created_by();

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array[
    'project_collaborators', 'project_milestones', 'project_blockers'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "internal_all" on public.%I;', t);
    execute format($p$create policy "internal_all" on public.%I
      for all to authenticated
      using (public.is_internal_member())
      with check (public.is_internal_member());$p$, t);
  end loop;
end $$;

alter table public.financial_payments enable row level security;
alter table public.financial_record_history enable row level security;

drop policy if exists "internal_all" on public.financial_records;
drop policy if exists "financial_records_read" on public.financial_records;
drop policy if exists "financial_records_admin_insert" on public.financial_records;
drop policy if exists "financial_records_admin_update" on public.financial_records;
create policy "financial_records_read" on public.financial_records
  for select to authenticated using (public.is_internal_member());
create policy "financial_records_admin_insert" on public.financial_records
  for insert to authenticated with check (public.is_internal_admin());
create policy "financial_records_admin_update" on public.financial_records
  for update to authenticated
  using (public.is_internal_admin()) with check (public.is_internal_admin());

drop policy if exists "financial_payments_read" on public.financial_payments;
drop policy if exists "financial_payments_admin_insert" on public.financial_payments;
create policy "financial_payments_read" on public.financial_payments
  for select to authenticated using (public.is_internal_member());
create policy "financial_payments_admin_insert" on public.financial_payments
  for insert to authenticated with check (public.is_internal_admin());

drop policy if exists "financial_history_read" on public.financial_record_history;
create policy "financial_history_read" on public.financial_record_history
  for select to authenticated using (public.is_internal_member());

-- Audit log: visible para el equipo, append-only y siempre a nombre del actor.
drop policy if exists "internal_all" on public.audit_log;
drop policy if exists "audit_log_read" on public.audit_log;
drop policy if exists "audit_log_insert" on public.audit_log;
create policy "audit_log_read" on public.audit_log
  for select to authenticated using (public.is_internal_member());
create policy "audit_log_insert" on public.audit_log
  for insert to authenticated
  with check (public.is_internal_member() and user_id = auth.uid());

grant select, insert, update, delete on public.project_collaborators to authenticated;
grant select, insert, update, delete on public.project_milestones to authenticated;
grant select, insert, update, delete on public.project_blockers to authenticated;
grant select, insert on public.financial_payments to authenticated;
grant select on public.financial_record_history to authenticated;

notify pgrst, 'reload schema';
