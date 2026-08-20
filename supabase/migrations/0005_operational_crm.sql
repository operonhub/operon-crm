-- ============================================================
-- Operon CRM operativo
-- - áreas y modalidad de proyectos
-- - finanzas operativas (no contabilidad ni facturación fiscal)
--
-- Migración aditiva: no elimina ni renombra columnas existentes.
-- El backfill de área usa el tipo de servicio histórico como aproximación
-- conservadora. Los proyectos existentes deben revisarse desde la UI.
-- ============================================================

-- ---------- Proyectos: área, modalidad y subtipo operativo ----------
alter table public.projects
  add column area text,
  add column engagement_kind text,
  add column operational_type text;

update public.projects
set area = case type
  when 'landing_page' then 'sites_ecommerce'
  when 'automation' then 'automations_crm'
  when 'lead_generation' then 'automations_crm'
  when 'package' then 'sites_ecommerce'
end
where area is null;

update public.projects
set engagement_kind = case when client_id is null then 'internal' else 'client' end
where engagement_kind is null;

alter table public.projects
  alter column area set default 'sites_ecommerce',
  alter column area set not null,
  alter column engagement_kind set default 'client',
  alter column engagement_kind set not null,
  add constraint projects_area_check check (
    area in ('sites_ecommerce', 'apps_saas', 'automations_crm', 'assets_brand')
  ),
  add constraint projects_engagement_kind_check check (
    engagement_kind in ('internal', 'client')
  ),
  add constraint projects_client_kind_check check (
    (engagement_kind = 'internal' and client_id is null)
    or (engagement_kind = 'client' and client_id is not null)
  );

create index projects_area_status_idx
  on public.projects (area, status);

-- Evita scans completos al detectar nombres parecidos. No es UNIQUE: dos
-- empresas distintas pueden compartir nombre y no se fusionan automáticamente.
create index organizations_normalized_name_idx
  on public.organizations (lower(btrim(name)));

-- ---------- Finanzas operativas ----------
create table public.financial_records (
  id           uuid primary key default gen_random_uuid(),
  record_type  text not null,
  concept      text not null,
  currency     text not null default 'ARS',
  total_amount numeric(14,2) not null,
  paid_amount  numeric(14,2) not null default 0,
  due_date     date,
  paid_at      date,
  canceled_at  timestamptz,
  client_id    uuid references public.clients(id) on delete set null,
  project_id   uuid references public.projects(id) on delete set null,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id),
  constraint financial_records_type_check
    check (record_type in ('income', 'expense')),
  constraint financial_records_currency_check
    check (currency in ('ARS', 'USD')),
  constraint financial_records_total_positive_check
    check (total_amount > 0),
  constraint financial_records_paid_range_check
    check (paid_amount >= 0 and paid_amount <= total_amount)
);

create index financial_records_due_open_idx
  on public.financial_records (due_date)
  where canceled_at is null;
create index financial_records_client_idx
  on public.financial_records (client_id);
create index financial_records_project_idx
  on public.financial_records (project_id);
create index financial_records_created_idx
  on public.financial_records (created_at desc);

alter table public.financial_records enable row level security;
create policy "internal_all" on public.financial_records
  for all to authenticated using (true) with check (true);

create trigger financial_records_set_updated_at
  before update on public.financial_records
  for each row execute function public.set_updated_at();

create trigger financial_records_set_created_by
  before insert on public.financial_records
  for each row execute function public.set_created_by();

-- El estado se deriva siempre de importes y fechas. Al vivir en una vista no
-- queda obsoleto al cambiar el día, y saldo nunca se duplica como dato mutable.
create view public.financial_records_operational
with (security_invoker = true)
as
select
  fr.*,
  (fr.total_amount - fr.paid_amount) as balance,
  case
    when fr.canceled_at is not null then 'cancelled'
    when fr.paid_amount >= fr.total_amount then 'paid'
    when fr.due_date is not null
      and fr.due_date < current_date
      and fr.paid_amount < fr.total_amount then 'overdue'
    when fr.paid_amount > 0 then 'partial'
    else 'pending'
  end as operational_status
from public.financial_records fr;

grant select on public.financial_records_operational to authenticated;
