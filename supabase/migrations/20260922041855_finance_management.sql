-- ============================================================
-- Finanzas de gestión
-- - caja real basada en pagos inmutables
-- - resultado económico por fecha de devengamiento
-- - líneas de negocio, recurrencias y medios de pago
-- - cotización histórica ARS/USD y adelantos de socios
--
-- Migración aditiva. No elimina movimientos existentes. Los movimientos USD
-- históricos quedan sin conversión ARS hasta que un administrador los edite,
-- porque inventar una cotización pasada distorsionaría los reportes.
-- ============================================================

-- ---------- Catálogos ----------
create table public.business_units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name text not null check (length(btrim(name)) between 1 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

insert into public.business_units (id, code, name) values
  ('b1000000-0000-0000-0000-000000000001', 'general', 'General'),
  ('b1000000-0000-0000-0000-000000000002', 'personalizados', 'Servicios personalizados'),
  ('b1000000-0000-0000-0000-000000000003', 'operon_reserva', 'Operon Reserva')
on conflict (code) do nothing;

create table public.finance_payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  method_type text not null check (
    method_type in ('cash', 'bank', 'credit_card', 'debit_card', 'wallet', 'other')
  ),
  owner_type text not null default 'operon' check (owner_type in ('operon', 'partner')),
  owner_profile_id uuid references public.profiles(id) on delete set null,
  owner_label text,
  currency text not null default 'ARS' check (currency in ('ARS', 'USD')),
  institution text,
  last_four text check (last_four is null or last_four ~ '^[0-9]{4}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  constraint finance_payment_methods_owner_check check (
    owner_type = 'operon'
    or owner_profile_id is not null
    or nullif(btrim(owner_label), '') is not null
  )
);

-- ---------- Movimientos existentes: dimensión económica y conversión ----------
alter table public.financial_records
  add column business_unit_id uuid references public.business_units(id) on delete restrict,
  add column contact_id uuid references public.contacts(id) on delete set null,
  add column category text,
  add column accrual_date date,
  add column recognition_months smallint not null default 1,
  add column exchange_rate_type text not null default 'none',
  add column exchange_rate numeric(14,4),
  add column exchange_rate_at timestamptz,
  add column amount_ars numeric(16,2),
  add column default_payment_method_id uuid references public.finance_payment_methods(id) on delete set null,
  add column default_paid_by_profile_id uuid references public.profiles(id) on delete set null,
  add column recurring_item_id uuid;

update public.financial_records
set business_unit_id = 'b1000000-0000-0000-0000-000000000001',
    category = case when record_type = 'income' then 'Otro ingreso' else 'Otro gasto' end,
    accrual_date = coalesce(due_date, created_at::date),
    amount_ars = case when currency = 'ARS' then total_amount else null end
where business_unit_id is null
   or category is null
   or accrual_date is null
   or (currency = 'ARS' and amount_ars is null);

alter table public.financial_records
  alter column business_unit_id set default 'b1000000-0000-0000-0000-000000000001',
  alter column business_unit_id set not null,
  alter column category set default 'Sin categoría',
  alter column category set not null,
  alter column accrual_date set default current_date,
  alter column accrual_date set not null;

alter table public.financial_records
  add constraint financial_records_recognition_months_check
    check (recognition_months between 1 and 120),
  add constraint financial_records_exchange_rate_type_check
    check (exchange_rate_type in ('none', 'official', 'blue', 'manual')),
  add constraint financial_records_exchange_snapshot_check check (
    (
      currency = 'ARS'
      and exchange_rate_type = 'none'
      and exchange_rate is null
      and amount_ars = total_amount
    )
    or (
      currency = 'USD'
      and (
        (exchange_rate_type = 'none' and exchange_rate is null and amount_ars is null)
        or (
          exchange_rate_type in ('official', 'blue', 'manual')
          and exchange_rate > 0
          and amount_ars > 0
        )
      )
    )
  );

-- ---------- Conceptos recurrentes ----------
create table public.finance_recurring_items (
  id uuid primary key default gen_random_uuid(),
  record_type text not null check (record_type in ('income', 'expense')),
  business_unit_id uuid not null references public.business_units(id) on delete restrict,
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  concept text not null check (length(btrim(concept)) between 1 and 180),
  category text not null,
  total_amount numeric(14,2) not null check (total_amount > 0),
  currency text not null default 'ARS' check (currency in ('ARS', 'USD')),
  frequency text not null default 'monthly' check (frequency in ('monthly', 'annual')),
  next_due_date date not null,
  end_date date,
  exchange_rate_type text not null default 'none'
    check (exchange_rate_type in ('none', 'official', 'blue', 'manual')),
  manual_exchange_rate numeric(14,4),
  default_payment_method_id uuid references public.finance_payment_methods(id) on delete set null,
  default_paid_by_profile_id uuid references public.profiles(id) on delete set null,
  recognition_months smallint not null default 1 check (recognition_months between 1 and 120),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  constraint finance_recurring_items_dates_check
    check (end_date is null or end_date >= next_due_date),
  constraint finance_recurring_items_rate_check check (
    (currency = 'ARS' and exchange_rate_type = 'none' and manual_exchange_rate is null)
    or (
      currency = 'USD'
      and exchange_rate_type in ('official', 'blue', 'manual')
      and (exchange_rate_type <> 'manual' or manual_exchange_rate > 0)
    )
  )
);

alter table public.financial_records
  add constraint financial_records_recurring_item_fkey
  foreign key (recurring_item_id)
  references public.finance_recurring_items(id)
  on delete set null;

create unique index financial_records_recurring_due_uidx
  on public.financial_records (recurring_item_id, due_date)
  where recurring_item_id is not null and canceled_at is null;

-- ---------- Pagos: cuenta, titular y valor histórico en ARS ----------
alter table public.financial_payments
  add column payment_method_id uuid references public.finance_payment_methods(id) on delete set null,
  add column paid_by_profile_id uuid references public.profiles(id) on delete set null,
  add column amount_ars numeric(16,2),
  add column exchange_rate_type text not null default 'none',
  add column exchange_rate numeric(14,4),
  add column exchange_rate_at timestamptz;

update public.financial_payments fp
set amount_ars = fp.amount
from public.financial_records fr
where fr.id = fp.financial_record_id
  and fr.currency = 'ARS'
  and fp.amount_ars is null;

alter table public.financial_payments
  add constraint financial_payments_amount_ars_check
    check (amount_ars is null or amount_ars > 0),
  add constraint financial_payments_exchange_rate_type_check
    check (exchange_rate_type in ('none', 'official', 'blue', 'manual')),
  add constraint financial_payments_exchange_rate_check
    check (exchange_rate is null or exchange_rate > 0);

create table public.finance_partner_reimbursements (
  id uuid primary key default gen_random_uuid(),
  financial_payment_id uuid not null unique
    references public.financial_payments(id) on delete restrict,
  reimbursed_on date not null default current_date,
  payment_method_id uuid references public.finance_payment_methods(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

-- ---------- Índices ----------
create index financial_records_unit_accrual_idx
  on public.financial_records (business_unit_id, accrual_date)
  where canceled_at is null;
create index financial_records_contact_idx
  on public.financial_records (contact_id)
  where contact_id is not null;
create index financial_records_default_method_idx
  on public.financial_records (default_payment_method_id)
  where default_payment_method_id is not null;
create index finance_payment_methods_owner_idx
  on public.finance_payment_methods (owner_profile_id)
  where owner_profile_id is not null;
create index finance_recurring_items_due_idx
  on public.finance_recurring_items (next_due_date, record_type)
  where active;
create index finance_recurring_items_unit_idx
  on public.finance_recurring_items (business_unit_id);
create index finance_recurring_items_client_idx
  on public.finance_recurring_items (client_id)
  where client_id is not null;
create index finance_recurring_items_project_idx
  on public.finance_recurring_items (project_id)
  where project_id is not null;
create index finance_recurring_items_contact_idx
  on public.finance_recurring_items (contact_id)
  where contact_id is not null;
create index financial_payments_method_idx
  on public.financial_payments (payment_method_id)
  where payment_method_id is not null;
create index financial_payments_paid_by_idx
  on public.financial_payments (paid_by_profile_id, paid_on)
  where paid_by_profile_id is not null;

-- ---------- Triggers estándar ----------
create trigger business_units_set_updated_at
  before update on public.business_units
  for each row execute function public.set_updated_at();
create trigger business_units_set_created_by
  before insert on public.business_units
  for each row execute function public.set_created_by();

create trigger finance_payment_methods_set_updated_at
  before update on public.finance_payment_methods
  for each row execute function public.set_updated_at();
create trigger finance_payment_methods_set_created_by
  before insert on public.finance_payment_methods
  for each row execute function public.set_created_by();

create trigger finance_recurring_items_set_updated_at
  before update on public.finance_recurring_items
  for each row execute function public.set_updated_at();
create trigger finance_recurring_items_set_created_by
  before insert on public.finance_recurring_items
  for each row execute function public.set_created_by();

create trigger finance_partner_reimbursements_set_created_by
  before insert on public.finance_partner_reimbursements
  for each row execute function public.set_created_by();

-- ---------- RLS y privilegios explícitos ----------
alter table public.business_units enable row level security;
alter table public.finance_payment_methods enable row level security;
alter table public.finance_recurring_items enable row level security;
alter table public.finance_partner_reimbursements enable row level security;

create policy "business_units_read" on public.business_units
  for select to authenticated using ((select public.is_internal_member()));
create policy "business_units_admin_insert" on public.business_units
  for insert to authenticated with check ((select public.is_internal_admin()));
create policy "business_units_admin_update" on public.business_units
  for update to authenticated
  using ((select public.is_internal_admin()))
  with check ((select public.is_internal_admin()));

create policy "finance_payment_methods_read" on public.finance_payment_methods
  for select to authenticated using ((select public.is_internal_member()));
create policy "finance_payment_methods_admin_insert" on public.finance_payment_methods
  for insert to authenticated with check ((select public.is_internal_admin()));
create policy "finance_payment_methods_admin_update" on public.finance_payment_methods
  for update to authenticated
  using ((select public.is_internal_admin()))
  with check ((select public.is_internal_admin()));

create policy "finance_recurring_items_read" on public.finance_recurring_items
  for select to authenticated using ((select public.is_internal_member()));
create policy "finance_recurring_items_admin_insert" on public.finance_recurring_items
  for insert to authenticated with check ((select public.is_internal_admin()));
create policy "finance_recurring_items_admin_update" on public.finance_recurring_items
  for update to authenticated
  using ((select public.is_internal_admin()))
  with check ((select public.is_internal_admin()));

create policy "finance_partner_reimbursements_read" on public.finance_partner_reimbursements
  for select to authenticated using ((select public.is_internal_member()));
create policy "finance_partner_reimbursements_admin_insert" on public.finance_partner_reimbursements
  for insert to authenticated with check ((select public.is_internal_admin()));

revoke all on public.business_units from anon;
revoke all on public.finance_payment_methods from anon;
revoke all on public.finance_recurring_items from anon;
revoke all on public.finance_partner_reimbursements from anon;

grant select, insert, update on public.business_units to authenticated;
grant select, insert, update on public.finance_payment_methods to authenticated;
grant select, insert, update on public.finance_recurring_items to authenticated;
grant select, insert on public.finance_partner_reimbursements to authenticated;

-- La vista debe recrearse para exponer las columnas nuevas agregadas a la tabla.
-- `create or replace` no admite insertar columnas antes de `balance`.
drop view public.financial_records_operational;
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

notify pgrst, 'reload schema';
