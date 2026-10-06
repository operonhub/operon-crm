import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestDb, seedIdentities, SANTIAGO, TOMI, type TestDb } from "./harness"

let db: TestDb

async function expenseWithPayment(concept: string) {
  const [record] = await db.admin<{ id: string }>(
    `insert into public.financial_records
       (record_type, concept, currency, total_amount, amount_ars, paid_amount, expense_kind)
     values ('expense', $1, 'ARS', 1000, 1000, 0, 'fixed') returning id`,
    [concept]
  )
  const [payment] = await db.admin<{ id: string }>(
    `insert into public.financial_payments (financial_record_id, amount, amount_ars, paid_on)
     values ($1, 1000, 1000, current_date) returning id`,
    [record.id]
  )
  return { recordId: record.id, paymentId: payment.id }
}

async function count(table: string, column: string, id: string) {
  const [row] = await db.admin<{ n: number }>(
    `select count(*)::int as n from public.${table} where ${column} = $1`,
    [id]
  )
  return row.n
}

beforeAll(async () => {
  db = await createTestDb()
  await seedIdentities(db)
}, 120_000)
afterAll(async () => { await db?.close() })

describe("borrado en lote de movimientos financieros", () => {
  it("un admin borra el movimiento con sus pagos, reintegros e historial", async () => {
    const { recordId, paymentId } = await expenseWithPayment("Suscripción a borrar")
    await db.admin(
      "insert into public.finance_partner_reimbursements (financial_payment_id) values ($1)",
      [paymentId]
    )
    expect(await count("financial_record_history", "financial_record_id", recordId)).toBeGreaterThan(0)

    const [result] = await db.as<{ n: number }>(
      SANTIAGO,
      "select public.delete_financial_records(array[$1]::uuid[]) as n",
      [recordId]
    )
    expect(result.n).toBe(1)
    expect(await count("financial_records", "id", recordId)).toBe(0)
    expect(await count("financial_payments", "id", paymentId)).toBe(0)
    expect(await count("finance_partner_reimbursements", "financial_payment_id", paymentId)).toBe(0)
    expect(await count("financial_record_history", "financial_record_id", recordId)).toBe(0)
  })

  it("un operador que no es admin no puede borrar", async () => {
    const { recordId } = await expenseWithPayment("Protegido")
    const error = await db.tryAs(TOMI, "select public.delete_financial_records(array[$1]::uuid[])", [recordId])
    expect(error?.code).toBe("42501")
    expect(await count("financial_records", "id", recordId)).toBe(1)
  })

  it("los pagos siguen siendo inmutables fuera de esa función", async () => {
    const { paymentId } = await expenseWithPayment("Pago inmutable")
    // Sin política de DELETE/UPDATE, RLS descarta la operación sin error: lo que
    // importa es que el pago sigue intacto.
    await db.tryAs(SANTIAGO, "delete from public.financial_payments where id = $1", [paymentId])
    await db.tryAs(SANTIAGO, "update public.financial_payments set note = 'x' where id = $1", [paymentId])
    expect(await count("financial_payments", "id", paymentId)).toBe(1)
    const [row] = await db.admin<{ note: string | null }>("select note from public.financial_payments where id = $1", [paymentId])
    expect(row.note).toBeNull()
  })

  it("el permiso de borrado no queda abierto después de la función", async () => {
    const { recordId, paymentId } = await expenseWithPayment("Reabre?")
    const other = await expenseWithPayment("Otro pago")
    await db.as(SANTIAGO, "select public.delete_financial_records(array[$1]::uuid[])", [recordId])
    expect(await count("financial_payments", "id", paymentId)).toBe(0)
    await db.tryAs(SANTIAGO, "delete from public.financial_payments where id = $1", [other.paymentId])
    // Ni siquiera con permisos totales: el trigger sigue cerrando el DELETE directo.
    await expect(
      db.admin("delete from public.financial_payments where id = $1", [other.paymentId])
    ).rejects.toThrow(/inmutables/)
    expect(await count("financial_payments", "id", other.paymentId)).toBe(1)
  })

  it("un admin puede eliminar un concepto recurrente y los movimientos generados quedan", async () => {
    const [unit] = await db.admin<{ id: string }>("select id from public.business_units limit 1")
    const [item] = await db.admin<{ id: string }>(
      `insert into public.finance_recurring_items
         (record_type, business_unit_id, concept, category, total_amount, next_due_date, expense_kind, auto_paid)
       values ('expense', $1, 'Netflix', 'Software', 100, current_date, 'fixed', true) returning id`,
      [unit.id]
    )
    const [record] = await db.admin<{ id: string }>(
      `insert into public.financial_records (record_type, concept, currency, total_amount, amount_ars, expense_kind, recurring_item_id)
       values ('expense','Netflix','ARS',100,100,'fixed',$1) returning id`,
      [item.id]
    )
    expect(await db.tryAs(TOMI, "delete from public.finance_recurring_items where id = $1", [item.id])).toBeNull()
    expect(await count("finance_recurring_items", "id", item.id)).toBe(1)
    expect(await db.tryAs(SANTIAGO, "delete from public.finance_recurring_items where id = $1", [item.id])).toBeNull()
    expect(await count("finance_recurring_items", "id", item.id)).toBe(0)
    expect(await count("financial_records", "id", record.id)).toBe(1)
  })
})
