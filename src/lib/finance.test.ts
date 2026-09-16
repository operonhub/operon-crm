import { describe, expect, it } from "vitest"
import {
  receivableHealth,
  financialBalance,
  financialStatus,
  summarizeFinances,
  validateCancellation,
  validatePayment,
  type FinancialRecordLike,
} from "./finance"

const TODAY = "2026-08-20"

function record(
  overrides: Partial<FinancialRecordLike> = {}
): FinancialRecordLike {
  return {
    record_type: "income",
    currency: "ARS",
    total_amount: 1000,
    paid_amount: 0,
    due_date: null,
    paid_at: null,
    canceled_at: null,
    ...overrides,
  }
}

describe("financialStatus", () => {
  it("calcula pendiente, parcial, vencido, cobrado y cancelado", () => {
    expect(financialStatus(record(), TODAY)).toBe("pending")
    expect(financialStatus(record({ paid_amount: 200 }), TODAY)).toBe("partial")
    expect(
      financialStatus(record({ paid_amount: 200, due_date: "2026-08-19" }), TODAY)
    ).toBe("overdue")
    expect(financialStatus(record({ paid_amount: 1000 }), TODAY)).toBe("paid")
    expect(
      financialStatus(record({ paid_amount: 1000, canceled_at: TODAY }), TODAY)
    ).toBe("cancelled")
  })

  it("no permite saldo negativo aunque el input externo sea inválido", () => {
    expect(financialBalance(record({ paid_amount: 1200 }))).toBe(0)
  })
})

describe("mutaciones financieras", () => {
  it("acepta pagos parciales y rechaza importes que exceden el saldo", () => {
    expect(validatePayment(record({ paid_amount: 200 }), 300)).toEqual({ ok: true })
    expect(validatePayment(record({ paid_amount: 900 }), 101)).toEqual({
      ok: false,
      error: "El pago supera el saldo pendiente.",
    })
  })

  it("rechaza pagos sobre movimientos cancelados y cancelaciones sin motivo", () => {
    expect(validatePayment(record({ canceled_at: TODAY }), 100).ok).toBe(false)
    expect(validateCancellation("  ").ok).toBe(false)
    expect(validateCancellation("Duplicado confirmado")).toEqual({ ok: true })
  })
})
describe("summarizeFinances", () => {
  it("separa monedas y no mezcla pendiente con vencido", () => {
    const summary = summarizeFinances(
      [
        record({ currency: "ARS", total_amount: 1000 }),
        record({ currency: "USD", total_amount: 200, due_date: "2026-08-01" }),
        record({
          currency: "USD",
          total_amount: 300,
          paid_amount: 300,
          paid_at: "2026-08-10",
        }),
        record({
          record_type: "expense",
          currency: "ARS",
          total_amount: 400,
          paid_amount: 400,
          paid_at: "2026-08-03",
        }),
      ],
      TODAY
    )

    expect(summary.pending).toEqual({ ARS: 1000, USD: 0 })
    expect(summary.overdue).toEqual({ ARS: 0, USD: 200 })
    expect(summary.collectedThisMonth).toEqual({ ARS: 0, USD: 300 })
    expect(summary.expensesThisMonth).toEqual({ ARS: 400, USD: 0 })
  })
})

describe("receivableHealth", () => {
  const resumen = (pending: number, overdue: number, collected = 0, expenses = 0) => ({
    pending: { ARS: pending, USD: 0 },
    overdue: { ARS: overdue, USD: 0 },
    collectedThisMonth: { ARS: collected, USD: 0 },
    expensesThisMonth: { ARS: expenses, USD: 0 },
  })

  it("calcula qué parte de lo adeudado está vencida", () => {
    const salud = receivableHealth(resumen(750_000, 250_000), "ARS")
    expect(salud.owed).toBe(1_000_000)
    expect(salud.overduePct).toBe(25)
  })

  it("no redondea a cero una deuda vencida chica", () => {
    expect(receivableHealth(resumen(1_000_000, 2_000), "ARS").overduePct).toBe(1)
  })

  it("sin deuda no inventa un porcentaje", () => {
    expect(receivableHealth(resumen(0, 0), "ARS").overduePct).toBeNull()
    expect(receivableHealth(resumen(0, 0), "USD").owed).toBe(0)
  })

  it("el neto del mes puede ser negativo", () => {
    expect(receivableHealth(resumen(0, 0, 100_000, 180_000), "ARS").netThisMonth).toBe(-80_000)
  })

  it("no mezcla monedas", () => {
    expect(receivableHealth(resumen(500, 500), "USD").owed).toBe(0)
  })
})
