-- ============================================================
-- Finanzas: borrado real en lote y gastos recurrentes que se pagan solos
--
-- 1) delete_financial_records(uuid[]): único camino para borrar movimientos.
--    Solo admins. Elimina también pagos, reintegros e historial del movimiento.
--    Los pagos siguen siendo inmutables para cualquier otro camino: el trigger
--    sólo deja pasar el DELETE cuando lo dispara esta función.
-- 2) finance_recurring_items.auto_paid: al generar el vencimiento de un gasto,
--    se registra el pago con el medio (tarjeta/cuenta) predeterminado.
-- 3) Los conceptos recurrentes pueden eliminarse (los movimientos ya
--    generados se conservan, sólo pierden el vínculo con la plantilla).
--
-- Migración aditiva y reversible; no toca datos existentes.
-- ============================================================

-- ---------- 1) Borrado en lote ----------
create or replace function public.prevent_financial_payment_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and current_setting('app.finance_hard_delete', true) = 'on'
     and (select public.is_internal_admin()) then
    return old;
  end if;
  raise exception 'Los pagos son inmutables. Registrá un ajuste en el movimiento financiero.';
end;
$$;

create or replace function public.delete_financial_records(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if not (select public.is_internal_admin()) then
    raise exception 'Esta acción requiere permisos de Fundador/admin.' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    return 0;
  end if;
  if cardinality(p_ids) > 200 then
    raise exception 'Se pueden borrar hasta 200 movimientos por vez.';
  end if;

  perform set_config('app.finance_hard_delete', 'on', true);

  delete from public.finance_partner_reimbursements
  where financial_payment_id in (
    select id from public.financial_payments
    where financial_record_id = any (p_ids)
  );
  delete from public.financial_payments where financial_record_id = any (p_ids);
  delete from public.financial_record_history where financial_record_id = any (p_ids);
  delete from public.financial_records where id = any (p_ids);
  get diagnostics v_deleted = row_count;

  perform set_config('app.finance_hard_delete', 'off', true);
  return v_deleted;
end;
$$;

revoke execute on function public.delete_financial_records(uuid[]) from public, anon;
grant execute on function public.delete_financial_records(uuid[]) to authenticated;

-- ---------- 2) Gastos que se pagan solos ----------
alter table public.finance_recurring_items
  add column if not exists auto_paid boolean not null default false;

-- ---------- 3) Eliminar conceptos recurrentes ----------
create policy "finance_recurring_items_admin_delete" on public.finance_recurring_items
  for delete to authenticated using ((select public.is_internal_admin()));

grant delete on public.finance_recurring_items to authenticated;

notify pgrst, 'reload schema';
