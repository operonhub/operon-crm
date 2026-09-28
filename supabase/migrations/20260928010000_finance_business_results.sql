-- Estado de resultados por unidad de negocio y alta de clientes con abono.

update public.business_units
set name = 'Operon Reservas'
where code = 'operon_reserva';

alter table public.clients
  add column business_unit_id uuid references public.business_units(id) on delete restrict;

update public.clients
set business_unit_id = 'b1000000-0000-0000-0000-000000000001'
where business_unit_id is null;

alter table public.clients
  alter column business_unit_id set default 'b1000000-0000-0000-0000-000000000001',
  alter column business_unit_id set not null;

create index clients_business_unit_idx
  on public.clients (business_unit_id)
  where archived_at is null;

drop policy if exists "financial_records_admin_insert" on public.financial_records;
create policy "financial_records_member_insert" on public.financial_records
  for insert to authenticated with check ((select public.is_internal_member()));

drop policy if exists "financial_payments_admin_insert" on public.financial_payments;
create policy "financial_payments_member_insert" on public.financial_payments
  for insert to authenticated with check ((select public.is_internal_member()));

alter table public.financial_records
  add column expense_kind text;

update public.financial_records
set expense_kind = case
  when record_type = 'income' then null
  when category in ('Comisiones') then 'variable'
  else 'fixed'
end;

alter table public.financial_records
  add constraint financial_records_expense_kind_check check (
    (record_type = 'income' and expense_kind is null)
    or (record_type = 'expense' and expense_kind in ('fixed', 'variable'))
  );

alter table public.finance_recurring_items
  add column expense_kind text;

update public.finance_recurring_items
set expense_kind = case
  when record_type = 'income' then null
  when category in ('Comisiones') then 'variable'
  else 'fixed'
end;

alter table public.finance_recurring_items
  add constraint finance_recurring_items_expense_kind_check check (
    (record_type = 'income' and expense_kind is null)
    or (record_type = 'expense' and expense_kind in ('fixed', 'variable'))
  );

create policy "finance_recurring_items_member_insert" on public.finance_recurring_items
  for insert to authenticated with check ((select public.is_internal_member()));

create or replace function public.create_client_with_maintenance(
  p_organization_id uuid,
  p_owner_id uuid,
  p_notes text,
  p_business_unit_id uuid,
  p_maintenance_amount numeric default null,
  p_maintenance_currency text default null,
  p_maintenance_next_due_date date default null,
  p_exchange_rate_type text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_client_id uuid;
  v_unit_code text;
begin
  select code into v_unit_code
  from public.business_units
  where id = p_business_unit_id and active;

  if v_unit_code is null then
    raise exception 'La línea de negocio no existe o está inactiva.';
  end if;

  if v_unit_code = 'operon_reserva' and (
    p_maintenance_amount is null or p_maintenance_amount <= 0
    or p_maintenance_currency not in ('ARS', 'USD')
    or p_maintenance_next_due_date is null
    or (p_maintenance_currency = 'USD' and p_exchange_rate_type not in ('official', 'blue'))
  ) then
    raise exception 'Operon Reservas requiere un mantenimiento mensual completo.';
  end if;

  insert into public.clients (
    organization_id, status, owner_id, notes, business_unit_id
  ) values (
    p_organization_id, 'activo', p_owner_id, p_notes, p_business_unit_id
  ) returning id into v_client_id;

  if v_unit_code = 'operon_reserva' then
    insert into public.finance_recurring_items (
      record_type, business_unit_id, client_id, concept, category,
      total_amount, currency, frequency, next_due_date,
      exchange_rate_type, recognition_months, expense_kind
    ) values (
      'income', p_business_unit_id, v_client_id, 'Mantenimiento mensual',
      'Mantenimiento', p_maintenance_amount, p_maintenance_currency,
      'monthly', p_maintenance_next_due_date,
      case when p_maintenance_currency = 'ARS' then 'none' else p_exchange_rate_type end,
      1, null
    );
  end if;

  return v_client_id;
end;
$$;

revoke all on function public.create_client_with_maintenance(uuid, uuid, text, uuid, numeric, text, date, text) from public, anon;
grant execute on function public.create_client_with_maintenance(uuid, uuid, text, uuid, numeric, text, date, text) to authenticated;

-- La vista se recrea para incorporar expense_kind al `fr.*`.
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
