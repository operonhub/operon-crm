import type {
  FinanceFrequency,
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

export type FinancialValidation = { ok: true } | { ok: false; error: string }

export function validatePayment(
  record: Pick<FinancialRecordLike, "total_amount" | "paid_amount" | "canceled_at">,
  amount: number
): FinancialValidation {
  if (record.canceled_at) {
    return { ok: false, error: "El movimiento está cancelado." }
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Ingresá un importe mayor que cero." }
  }
  if (amount > financialBalance(record)) {
    return { ok: false, error: "El pago supera el saldo pendiente." }
  }
  return { ok: true }
}

export function validateCancellation(reason: string): FinancialValidation {
  if (!reason.trim()) {
    return { ok: false, error: "Indicá el motivo de la cancelación." }
  }
  return { ok: true }
}

export type ManagementRecordLike = {
  record_type: "income" | "expense"
  canceled_at: string | null
  amount_ars: number | null
  accrual_date: string
  recognition_months: number
}

export type ManagementPaymentLike = {
  amount_ars: number | null
  paid_on: string
  record_type: "income" | "expense"
}

export type ManagementSummary = {
  cashIncomeArs: number
  cashExpenseArs: number
  cashNetArs: number
  economicIncomeArs: number
  economicExpenseArs: number
  economicNetArs: number
  unconvertedItems: number
}

function monthIndex(value: string): number {
  const [year, month] = value.slice(0, 7).split("-").map(Number)
  return year * 12 + month - 1
}

export function economicAmountInMonth(
  record: ManagementRecordLike,
  month: string
): number {
  if (record.canceled_at || record.amount_ars == null) return 0
  const recognitionMonths = Math.max(1, Number(record.recognition_months) || 1)
  const offset = monthIndex(`${month}-01`) - monthIndex(record.accrual_date)
  if (offset < 0 || offset >= recognitionMonths) return 0
  return Number(record.amount_ars) / recognitionMonths
}

export function summarizeManagement(
  records: ManagementRecordLike[],
  payments: ManagementPaymentLike[],
  month: string
): ManagementSummary {
  let cashIncomeArs = 0
  let cashExpenseArs = 0
  let economicIncomeArs = 0
  let economicExpenseArs = 0
  let unconvertedItems = 0

  for (const payment of payments) {
    if (!payment.paid_on.startsWith(month)) continue
    if (payment.amount_ars == null) {
      unconvertedItems += 1
      continue
    }
    if (payment.record_type === "income") cashIncomeArs += Number(payment.amount_ars)
    else cashExpenseArs += Number(payment.amount_ars)
  }

  for (const record of records) {
    if (!record.canceled_at && record.amount_ars == null) {
      unconvertedItems += 1
      continue
    }
    const amount = economicAmountInMonth(record, month)
    if (record.record_type === "income") economicIncomeArs += amount
    else economicExpenseArs += amount
  }

  return {
    cashIncomeArs,
    cashExpenseArs,
    cashNetArs: cashIncomeArs - cashExpenseArs,
    economicIncomeArs,
    economicExpenseArs,
    economicNetArs: economicIncomeArs - economicExpenseArs,
    unconvertedItems,
  }
}

export function advanceDueDate(value: string, frequency: FinanceFrequency): string {
  const [year, month, day] = value.split("-").map(Number)
  const monthsToAdd = frequency === "monthly" ? 1 : 12
  const targetMonthIndex = month - 1 + monthsToAdd
  const targetYear = year + Math.floor(targetMonthIndex / 12)
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)))
    .toISOString()
    .slice(0, 10)
}

export function normalizeWhatsAppPhone(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "")
}

export function buildCollectionMessage(input: {
  contactName?: string | null
  concept: string
  amount: number
  currency: SupportedCurrency
  amountArs?: number | null
  exchangeRate?: number | null
  rateLabel?: string | null
  dueDate?: string | null
}) {
  const greeting = input.contactName ? `Hola ${input.contactName},` : "Hola,"
  const original = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: input.currency,
    maximumFractionDigits: 2,
  }).format(input.amount)
  const rate = input.exchangeRate && input.amountArs
    ? ` La cotización ${input.rateLabel ?? "seleccionada"} es $${input.exchangeRate.toLocaleString("es-AR")} por USD, por lo que el total es ${new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        maximumFractionDigits: 0,
      }).format(input.amountArs)}.`
    : ""
  const due = input.dueDate ? ` Vence el ${input.dueDate}.` : ""
  return `${greeting} te compartimos el cobro de ${input.concept} por ${original}.${rate}${due} Gracias.`
}

export type ReceivableHealth = {
  currency: SupportedCurrency
  /** Todo lo que falta cobrar: al día + vencido. */
  owed: number
  onTime: number
  overdue: number
  /** Porción vencida de lo que falta cobrar, 0–100. `null` si no se debe nada. */
  overduePct: number | null
  /** Cobrado menos gastado en el mes. Puede ser negativo. */
  netThisMonth: number
}

/**
 * La pregunta que responde la barra de Finanzas: de lo que me deben, ¿cuánto
 * ya está vencido? Por moneda, nunca sumando pesos con dólares.
 *
 * El porcentaje se redondea hacia arriba si hay algo vencido: un 0,3% vencido
 * mostrado como "0%" esconde justo la deuda que hay que ir a cobrar.
 */
export function receivableHealth(
  summary: FinancialSummary,
  currency: SupportedCurrency
): ReceivableHealth {
  const onTime = summary.pending[currency]
  const overdue = summary.overdue[currency]
  const owed = onTime + overdue
  const overduePct =
    owed === 0 ? null : overdue === 0 ? 0 : Math.min(100, Math.max(1, Math.round((overdue / owed) * 100)))
  return {
    currency,
    owed,
    onTime,
    overdue,
    overduePct,
    netThisMonth: summary.collectedThisMonth[currency] - summary.expensesThisMonth[currency],
  }
}
