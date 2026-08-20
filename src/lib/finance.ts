import type {
  FinancialStatus,
  SupportedCurrency,
} from "@/lib/constants"

export type FinancialRecordLike = {
  record_type: "income" | "expense"
  currency: SupportedCurrency
  total_amount: number
  paid_amount: number
  due_date: string | null
  paid_at: string | null
  canceled_at: string | null
}
export type MoneyByCurrency = Record<SupportedCurrency, number>

export function emptyMoney(): MoneyByCurrency {
  return { ARS: 0, USD: 0 }
}

/** El saldo nunca se persiste: siempre sale de total menos cobrado/pagado. */
export function financialBalance(
  record: Pick<FinancialRecordLike, "total_amount" | "paid_amount">
): number {
  return Math.max(0, Number(record.total_amount) - Number(record.paid_amount))
}

/** Misma precedencia que la vista SQL `financial_records_operational`. */
export function financialStatus(
  record: FinancialRecordLike,
  today: string
): FinancialStatus {
  if (record.canceled_at) return "cancelled"
  if (financialBalance(record) === 0) return "paid"
  if (record.due_date && record.due_date < today) return "overdue"
  if (Number(record.paid_amount) > 0) return "partial"
  return "pending"
}

function add(
  totals: MoneyByCurrency,
  currency: SupportedCurrency,
  amount: number
) {
  totals[currency] += Number(amount) || 0
}

export type FinancialSummary = {
  collectedThisMonth: MoneyByCurrency
  pending: MoneyByCurrency
  overdue: MoneyByCurrency
  expensesThisMonth: MoneyByCurrency
}

export function summarizeFinances(
  records: FinancialRecordLike[],
  today: string
): FinancialSummary {
  const month = today.slice(0, 7)
  const summary: FinancialSummary = {
    collectedThisMonth: emptyMoney(),
    pending: emptyMoney(),
    overdue: emptyMoney(),
    expensesThisMonth: emptyMoney(),
  }

  for (const record of records) {
    const status = financialStatus(record, today)
    if (status === "cancelled") continue

    if (record.record_type === "income") {
      if (record.paid_at?.startsWith(month)) {
        add(summary.collectedThisMonth, record.currency, record.paid_amount)
      }
      const balance = financialBalance(record)
      if (status === "overdue") add(summary.overdue, record.currency, balance)
      else if (status === "pending" || status === "partial") {
        add(summary.pending, record.currency, balance)
      }
    } else if (record.paid_at?.startsWith(month)) {
      add(summary.expensesThisMonth, record.currency, record.paid_amount)
    }
  }

  return summary
}

export function hasMoney(totals: MoneyByCurrency): boolean {
  return totals.ARS !== 0 || totals.USD !== 0
}
