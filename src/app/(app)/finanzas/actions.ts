"use server"

import { revalidatePath } from "next/cache"
import type { ActionResult } from "@/lib/action-result"
import { writeAudit } from "@/lib/audit"
import { authorizationMessage, requireAdmin } from "@/lib/auth"
import {
  FINANCE_EXCHANGE_RATE_TYPES,
  FINANCE_FREQUENCIES,
  FINANCE_PAYMENT_METHOD_TYPES,
  SUPPORTED_CURRENCIES,
  type FinanceExchangeRateType,
  type FinanceFrequency,
  type FinancePaymentMethodType,
  type FinancialRecordType,
  type SupportedCurrency,
} from "@/lib/constants"
import { convertUsdToArs, getExchangeRateSnapshot } from "@/lib/exchange-rates"
import {
  advanceDueDate,
  financialBalance,
  validateCancellation,
  validatePayment,
} from "@/lib/finance"

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim()
}

function amount(fd: FormData, key: string): number {
  const raw = str(fd, key).replace(",", ".")
  return raw ? Number(raw) : 0
}

function integer(fd: FormData, key: string, fallback = 1): number {
  const value = Number.parseInt(str(fd, key), 10)
  return Number.isFinite(value) ? value : fallback
}

async function moneySnapshot(
  currency: SupportedCurrency,
  total: number,
  rateType: FinanceExchangeRateType,
  manualRate: number
) {
  if (currency === "ARS") {
    return {
      amountArs: total,
      rateType: "none" as const,
      exchangeRate: null,
      exchangeRateAt: null,
    }
  }
  if (!FINANCE_EXCHANGE_RATE_TYPES.includes(rateType) || rateType === "none") {
    throw new Error("Elegí dólar oficial, blue o una cotización manual.")
  }
  const quote = await getExchangeRateSnapshot(rateType, manualRate)
  if (!quote) throw new Error("No se pudo obtener la cotización.")
  return {
    amountArs: convertUsdToArs(total, quote.sellRate),
    rateType: quote.type,
    exchangeRate: quote.sellRate,
    exchangeRateAt: quote.quotedAt,
  }
}

async function paymentSnapshot(
  record: {
    currency: string
    exchange_rate_type: string
    exchange_rate: number | null
    exchange_rate_at: string | null
  },
  paymentAmount: number
) {
  if (record.currency === "ARS") {
    return { amountArs: paymentAmount, rateType: "none", exchangeRate: null, exchangeRateAt: null }
  }
  if (record.exchange_rate && record.exchange_rate > 0) {
    return {
      amountArs: convertUsdToArs(paymentAmount, record.exchange_rate),
      rateType: record.exchange_rate_type === "none" ? "manual" : record.exchange_rate_type,
      exchangeRate: record.exchange_rate,
      exchangeRateAt: record.exchange_rate_at,
    }
  }
  const quote = await getExchangeRateSnapshot("official")
  if (!quote) throw new Error("No se pudo cotizar el pago.")
  return {
    amountArs: convertUsdToArs(paymentAmount, quote.sellRate),
    rateType: quote.type,
    exchangeRate: quote.sellRate,
    exchangeRateAt: quote.quotedAt,
  }
}

function refreshFinances() {
  revalidatePath("/")
  revalidatePath("/finanzas")
  revalidatePath("/metricas")
}

function revalidateFinancialConsumers(clientId?: string, projectId?: string) {
  revalidatePath("/")
  revalidatePath("/finanzas")
  revalidatePath("/metricas")
  revalidatePath("/clientes")
  if (clientId) revalidatePath(`/clientes/${clientId}`)
  if (projectId) revalidatePath(`/proyectos/${projectId}`)
}

export async function createFinancialRecord(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireAdmin()
    const concept = str(fd, "concept")
    const recordType = str(fd, "record_type") as FinancialRecordType
    const currency = str(fd, "currency") as SupportedCurrency
    const totalAmount = amount(fd, "total_amount")
    const initialPayment = amount(fd, "paid_amount")
    const dueDate = str(fd, "due_date")
    const paidOn = str(fd, "paid_at")
    const clientId = str(fd, "client_id")
    const projectId = str(fd, "project_id")
    const notes = str(fd, "notes")
    const businessUnitId = str(fd, "business_unit_id")
    const contactId = str(fd, "contact_id")
    const category = str(fd, "category")
    const accrualDate = str(fd, "accrual_date")
    const recognitionMonths = integer(fd, "recognition_months")
    const rateType = (currency === "ARS" ? "none" : str(fd, "exchange_rate_type")) as FinanceExchangeRateType
    const paymentMethodId = str(fd, "payment_method_id")
    const paidByProfileId = str(fd, "paid_by_profile_id")

    if (!concept) return { error: "El concepto es obligatorio." }
    if (recordType !== "income" && recordType !== "expense") {
      return { error: "Elegí ingreso o gasto." }
    }
    if (!SUPPORTED_CURRENCIES.includes(currency)) {
      return { error: "La moneda debe ser ARS o USD." }
    }
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return { error: "El monto total debe ser mayor que cero." }
    }
    if (initialPayment < 0 || initialPayment > totalAmount) {
      return { error: "El pago inicial debe estar entre cero y el total." }
    }
    if (initialPayment > 0 && !paidOn) {
      return { error: "Indicá la fecha del cobro o pago inicial." }
    }
    if (!businessUnitId || !category || !accrualDate) {
      return { error: "Completá línea de negocio, categoría y fecha económica." }
    }
    if (recognitionMonths < 1 || recognitionMonths > 120) {
      return { error: "El devengamiento debe distribuirse entre 1 y 120 meses." }
    }

    let snapshot
    try {
      snapshot = await moneySnapshot(currency, totalAmount, rateType, amount(fd, "manual_exchange_rate"))
    } catch (error) {
      return { error: error instanceof Error ? error.message : "No se pudo cotizar el movimiento." }
    }

    const { data: record, error } = await supabase
      .from("financial_records")
      .insert({
        concept,
        record_type: recordType,
        currency,
        total_amount: totalAmount,
        amount_ars: snapshot.amountArs,
        exchange_rate_type: snapshot.rateType,
        exchange_rate: snapshot.exchangeRate,
        exchange_rate_at: snapshot.exchangeRateAt,
        paid_amount: 0,
        due_date: dueDate || null,
        accrual_date: accrualDate,
        recognition_months: recognitionMonths,
        business_unit_id: businessUnitId,
        category,
        contact_id: contactId || null,
        default_payment_method_id: paymentMethodId || null,
        default_paid_by_profile_id: recordType === "expense" ? paidByProfileId || null : null,
        paid_at: null,
        client_id: clientId || null,
        project_id: projectId || null,
        notes: notes || null,
        updated_by: profile.id,
      })
      .select("id")
      .single()
    if (error || !record) {
      return { error: error?.message ?? "No se pudo crear el movimiento." }
    }

    if (initialPayment > 0) {
      const { error: paymentError } = await supabase
        .from("financial_payments")
        .insert({
          financial_record_id: record.id,
          amount: initialPayment,
          amount_ars: currency === "ARS"
            ? initialPayment
            : convertUsdToArs(initialPayment, snapshot.exchangeRate ?? 0),
          exchange_rate_type: snapshot.rateType,
          exchange_rate: snapshot.exchangeRate,
          exchange_rate_at: snapshot.exchangeRateAt,
          paid_on: paidOn,
          note: "Pago inicial",
          payment_method_id: paymentMethodId || null,
          paid_by_profile_id: recordType === "expense" ? paidByProfileId || null : null,
        })
      if (paymentError) {
        revalidateFinancialConsumers(clientId, projectId)
        return {
          error: `Movimiento creado, pero no se registró el pago inicial: ${paymentError.message}`,
        }
      }
    }
    await writeAudit(supabase, profile.id, "financial_record", record.id, "created")
    revalidateFinancialConsumers(clientId, projectId)
    return { ok: true, message: "Movimiento creado." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function addFinancialPayment(
  recordId: string,
  clientId: string | null,
  projectId: string | null,
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireAdmin()
    const paymentAmount =
      amount(fd, "payment_amount") || amount(fd, "paid_amount")
    const paidOn = str(fd, "paid_on") || str(fd, "paid_at")
    const note = str(fd, "payment_note")
    const { data: record, error: readError } = await supabase
      .from("financial_records")
      .select("total_amount, paid_amount, canceled_at, currency, exchange_rate_type, exchange_rate, exchange_rate_at, default_payment_method_id, default_paid_by_profile_id")
      .eq("id", recordId)
      .single()
    if (readError || !record) return { error: "Movimiento no encontrado." }
    const validation = validatePayment(record, paymentAmount)
    if (!validation.ok) return { error: validation.error }
    if (!paidOn) return { error: "Indicá la fecha del cobro o pago." }

    let paymentMoney
    try {
      paymentMoney = await paymentSnapshot(record, paymentAmount)
    } catch (error) {
      return { error: error instanceof Error ? error.message : "No se pudo cotizar el pago." }
    }

    const { data: payment, error } = await supabase
      .from("financial_payments")
      .insert({
        financial_record_id: recordId,
        amount: paymentAmount,
        amount_ars: paymentMoney.amountArs,
        exchange_rate_type: paymentMoney.rateType,
        exchange_rate: paymentMoney.exchangeRate,
        exchange_rate_at: paymentMoney.exchangeRateAt,
        paid_on: paidOn,
        note: note || null,
        payment_method_id: str(fd, "payment_method_id") || record.default_payment_method_id,
        paid_by_profile_id: str(fd, "paid_by_profile_id") || record.default_paid_by_profile_id,
      })
      .select("id")
      .single()
    if (error || !payment) {
      return { error: error?.message ?? "No se pudo registrar el pago." }
    }
    await writeAudit(supabase, profile.id, "financial_payment", payment.id, "created", {
      financial_record_id: recordId,
      amount: paymentAmount,
    })
    revalidateFinancialConsumers(clientId ?? undefined, projectId ?? undefined)
    return { ok: true, message: "Pago registrado." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

/**
 * Compatibilidad con el formulario previo, que enviaba el acumulado. Solo se
 * agrega la diferencia: nunca se reescribe ni se borra un pago histórico.
 */
export async function updateFinancialPayment(
  recordId: string,
  _totalAmount: number,
  clientId: string | null,
  projectId: string | null,
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireAdmin()
    const requestedAccumulated = amount(fd, "paid_amount")
    const paidOn = str(fd, "paid_at")
    const { data: record, error: readError } = await supabase
      .from("financial_records")
      .select("total_amount, paid_amount, canceled_at, currency, exchange_rate_type, exchange_rate, exchange_rate_at, default_payment_method_id, default_paid_by_profile_id")
      .eq("id", recordId)
      .single()
    if (readError || !record) return { error: "Movimiento no encontrado." }
    const delta = requestedAccumulated - Number(record.paid_amount)
    if (delta < 0) {
      return {
        error: "Los pagos son inmutables: no se puede reducir lo ya registrado.",
      }
    }
    if (delta === 0) {
      return { ok: true, message: "No había cambios para guardar." }
    }
    const validation = validatePayment(record, delta)
    if (!validation.ok) return { error: validation.error }
    if (!paidOn) return { error: "Indicá la fecha del cobro o pago." }
    let paymentMoney
    try {
      paymentMoney = await paymentSnapshot(record, delta)
    } catch (error) {
      return { error: error instanceof Error ? error.message : "No se pudo cotizar el pago." }
    }
    const { data: payment, error } = await supabase
      .from("financial_payments")
      .insert({
        financial_record_id: recordId,
        amount: delta,
        amount_ars: paymentMoney.amountArs,
        exchange_rate_type: paymentMoney.rateType,
        exchange_rate: paymentMoney.exchangeRate,
        exchange_rate_at: paymentMoney.exchangeRateAt,
        paid_on: paidOn,
        note: "Pago agregado desde edición acumulada",
        payment_method_id: record.default_payment_method_id,
        paid_by_profile_id: record.default_paid_by_profile_id,
      })
      .select("id")
      .single()
    if (error || !payment) {
      return { error: error?.message ?? "No se pudo registrar el pago." }
    }
    await writeAudit(supabase, profile.id, "financial_payment", payment.id, "created")
    revalidateFinancialConsumers(clientId ?? undefined, projectId ?? undefined)
    return { ok: true, message: "Pago agregado al historial." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function completeFinancialRecord(
  recordId: string,
  clientId: string | null,
  projectId: string | null,
  paidOn: string
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireAdmin()
    const { data: record, error: readError } = await supabase
      .from("financial_records")
      .select("total_amount, paid_amount, canceled_at, currency, exchange_rate_type, exchange_rate, exchange_rate_at, default_payment_method_id, default_paid_by_profile_id")
      .eq("id", recordId)
      .single()
    if (readError || !record) return { error: "Movimiento no encontrado." }
    const balance = financialBalance(record)
    const validation = validatePayment(record, balance)
    if (!validation.ok) return { error: validation.error }
    let paymentMoney
    try {
      paymentMoney = await paymentSnapshot(record, balance)
    } catch (error) {
      return { error: error instanceof Error ? error.message : "No se pudo cotizar el pago." }
    }
    const { data: payment, error } = await supabase
      .from("financial_payments")
      .insert({
        financial_record_id: recordId,
        amount: balance,
        amount_ars: paymentMoney.amountArs,
        exchange_rate_type: paymentMoney.rateType,
        exchange_rate: paymentMoney.exchangeRate,
        exchange_rate_at: paymentMoney.exchangeRateAt,
        paid_on: paidOn,
        note: "Saldo completado",
        payment_method_id: record.default_payment_method_id,
        paid_by_profile_id: record.default_paid_by_profile_id,
      })
      .select("id")
      .single()
    if (error || !payment) {
      return { error: error?.message ?? "No se pudo completar el saldo." }
    }
    await writeAudit(
      supabase,
      profile.id,
      "financial_payment",
      payment.id,
      "completed_balance"
    )
    revalidateFinancialConsumers(clientId ?? undefined, projectId ?? undefined)
    return { ok: true, message: "Saldo completado." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function updateFinancialRecord(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireAdmin()
    const recordId = str(fd, "record_id")
    const concept = str(fd, "concept")
    const totalAmount = amount(fd, "total_amount")
    const currency = str(fd, "currency") as SupportedCurrency
    const clientId = str(fd, "client_id")
    const projectId = str(fd, "project_id")
    const businessUnitId = str(fd, "business_unit_id")
    const contactId = str(fd, "contact_id")
    const category = str(fd, "category")
    const accrualDate = str(fd, "accrual_date")
    const recognitionMonths = integer(fd, "recognition_months")
    const rateType = (currency === "ARS" ? "none" : str(fd, "exchange_rate_type")) as FinanceExchangeRateType
    if (!recordId || !concept) return { error: "Completá el concepto." }
    if (!SUPPORTED_CURRENCIES.includes(currency)) {
      return { error: "Moneda inválida." }
    }
    const { data: current } = await supabase
      .from("financial_records")
      .select("paid_amount")
      .eq("id", recordId)
      .single()
    if (!current) return { error: "Movimiento no encontrado." }
    if (totalAmount < Number(current.paid_amount)) {
      return { error: "El total no puede ser menor que los pagos registrados." }
    }
    let snapshot
    try {
      snapshot = await moneySnapshot(currency, totalAmount, rateType, amount(fd, "manual_exchange_rate"))
    } catch (error) {
      return { error: error instanceof Error ? error.message : "No se pudo cotizar el movimiento." }
    }
    const { error } = await supabase
      .from("financial_records")
      .update({
        concept,
        total_amount: totalAmount,
        currency,
        amount_ars: snapshot.amountArs,
        exchange_rate_type: snapshot.rateType,
        exchange_rate: snapshot.exchangeRate,
        exchange_rate_at: snapshot.exchangeRateAt,
        due_date: str(fd, "due_date") || null,
        accrual_date: accrualDate,
        recognition_months: recognitionMonths,
        business_unit_id: businessUnitId,
        category,
        contact_id: contactId || null,
        default_payment_method_id: str(fd, "payment_method_id") || null,
        default_paid_by_profile_id: str(fd, "paid_by_profile_id") || null,
        client_id: clientId || null,
        project_id: projectId || null,
        notes: str(fd, "notes") || null,
        updated_by: profile.id,
      })
      .eq("id", recordId)
      .is("canceled_at", null)
    if (error) return { error: error.message }
    await writeAudit(supabase, profile.id, "financial_record", recordId, "updated")
    revalidateFinancialConsumers(clientId, projectId)
    return { ok: true, message: "Movimiento actualizado." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function createFinancePaymentMethod(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase } = await requireAdmin()
    const name = str(fd, "name")
    const methodType = str(fd, "method_type")
    const ownerType = str(fd, "owner_type") || "operon"
    const currency = str(fd, "currency") as SupportedCurrency
    const lastFour = str(fd, "last_four")
    if (!name) return { error: "Ingresá un nombre para el medio de pago." }
    if (!FINANCE_PAYMENT_METHOD_TYPES.includes(methodType as FinancePaymentMethodType)) {
      return { error: "Tipo de medio de pago inválido." }
    }
    if (ownerType !== "operon" && ownerType !== "partner") {
      return { error: "Titular inválido." }
    }
    if (!SUPPORTED_CURRENCIES.includes(currency)) return { error: "Moneda inválida." }
    if (lastFour && !/^\d{4}$/.test(lastFour)) {
      return { error: "Guardá sólo los últimos cuatro dígitos." }
    }
    if (ownerType === "partner" && !str(fd, "owner_profile_id") && !str(fd, "owner_label")) {
      return { error: "Elegí el socio titular o escribí su nombre." }
    }
    const { error } = await supabase.from("finance_payment_methods").insert({
      name,
      method_type: methodType,
      owner_type: ownerType,
      owner_profile_id: ownerType === "partner" ? str(fd, "owner_profile_id") || null : null,
      owner_label: ownerType === "partner" ? str(fd, "owner_label") || null : null,
      currency,
      institution: str(fd, "institution") || null,
      last_four: lastFour || null,
    })
    if (error) return { error: error.message }
    refreshFinances()
    return { ok: true, message: "Medio de pago guardado." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function createFinanceRecurringItem(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase } = await requireAdmin()
    const recordType = str(fd, "record_type") as FinancialRecordType
    const currency = str(fd, "currency") as SupportedCurrency
    const frequency = str(fd, "frequency") as FinanceFrequency
    const totalAmount = amount(fd, "total_amount")
    const rateType = (currency === "ARS" ? "none" : str(fd, "exchange_rate_type")) as FinanceExchangeRateType
    if (recordType !== "income" && recordType !== "expense") return { error: "Tipo inválido." }
    if (!SUPPORTED_CURRENCIES.includes(currency)) return { error: "Moneda inválida." }
    if (!FINANCE_FREQUENCIES.includes(frequency)) return { error: "Frecuencia inválida." }
    if (!str(fd, "concept") || !str(fd, "business_unit_id") || !str(fd, "next_due_date")) {
      return { error: "Completá concepto, línea y próximo vencimiento." }
    }
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) return { error: "El monto debe ser mayor que cero." }
    if (currency === "USD" && (!FINANCE_EXCHANGE_RATE_TYPES.includes(rateType) || rateType === "none")) {
      return { error: "Elegí la cotización del abono." }
    }
    const { error } = await supabase.from("finance_recurring_items").insert({
      record_type: recordType,
      business_unit_id: str(fd, "business_unit_id"),
      client_id: str(fd, "client_id") || null,
      project_id: str(fd, "project_id") || null,
      contact_id: str(fd, "contact_id") || null,
      concept: str(fd, "concept"),
      category: str(fd, "category") || (recordType === "income" ? "Otro ingreso" : "Otro gasto"),
      total_amount: totalAmount,
      currency,
      frequency,
      next_due_date: str(fd, "next_due_date"),
      end_date: str(fd, "end_date") || null,
      exchange_rate_type: rateType,
      manual_exchange_rate: rateType === "manual" ? amount(fd, "manual_exchange_rate") : null,
      default_payment_method_id: str(fd, "payment_method_id") || null,
      default_paid_by_profile_id: recordType === "expense" ? str(fd, "paid_by_profile_id") || null : null,
      recognition_months: integer(fd, "recognition_months"),
      notes: str(fd, "notes") || null,
    })
    if (error) return { error: error.message }
    refreshFinances()
    return { ok: true, message: "Concepto recurrente guardado." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function generateFinanceRecurringRecord(fd: FormData): Promise<void> {
  const { supabase, profile } = await requireAdmin()
  const id = str(fd, "recurring_item_id")
  const { data: item, error: readError } = await supabase
    .from("finance_recurring_items")
    .select("*")
    .eq("id", id)
    .eq("active", true)
    .single()
  if (readError || !item) throw new Error("No se encontró el concepto recurrente.")
  const rateType = item.exchange_rate_type as FinanceExchangeRateType
  const currency = item.currency as SupportedCurrency
  const snapshot = await moneySnapshot(currency, Number(item.total_amount), rateType, Number(item.manual_exchange_rate ?? 0))
  const { error } = await supabase.from("financial_records").insert({
    record_type: item.record_type,
    concept: item.concept,
    category: item.category,
    currency,
    total_amount: item.total_amount,
    paid_amount: 0,
    amount_ars: snapshot.amountArs,
    exchange_rate_type: snapshot.rateType,
    exchange_rate: snapshot.exchangeRate,
    exchange_rate_at: snapshot.exchangeRateAt,
    due_date: item.next_due_date,
    accrual_date: item.next_due_date,
    recognition_months: item.recognition_months,
    business_unit_id: item.business_unit_id,
    client_id: item.client_id,
    project_id: item.project_id,
    contact_id: item.contact_id,
    default_payment_method_id: item.default_payment_method_id,
    default_paid_by_profile_id: item.default_paid_by_profile_id,
    recurring_item_id: item.id,
    notes: item.notes,
    updated_by: profile.id,
  })
  if (error && error.code !== "23505") throw new Error(error.message)
  const nextDueDate = advanceDueDate(item.next_due_date, item.frequency as FinanceFrequency)
  const remainsActive = !item.end_date || nextDueDate <= item.end_date
  const { error: updateError } = await supabase
    .from("finance_recurring_items")
    .update({ next_due_date: nextDueDate, active: remainsActive })
    .eq("id", item.id)
  if (updateError) throw new Error(updateError.message)
  refreshFinances()
}

export async function reimbursePartnerPayment(fd: FormData): Promise<void> {
  const { supabase } = await requireAdmin()
  const { error } = await supabase.from("finance_partner_reimbursements").insert({
    financial_payment_id: str(fd, "financial_payment_id"),
    reimbursed_on: str(fd, "reimbursed_on"),
    payment_method_id: str(fd, "payment_method_id") || null,
    note: str(fd, "note") || null,
  })
  if (error) throw new Error(error.message)
  refreshFinances()
}

export async function cancelFinancialRecordWithReason(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  const recordId = str(fd, "record_id")
  const clientId = str(fd, "client_id") || null
  const projectId = str(fd, "project_id") || null
  const reason = str(fd, "cancel_reason")
  return cancelFinancialRecord(recordId, clientId, projectId, reason)
}

export async function cancelFinancialRecord(
  recordId: string,
  clientId: string | null,
  projectId: string | null,
  reason = "Cancelado desde Finanzas"
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireAdmin()
    const validation = validateCancellation(reason)
    if (!validation.ok) return { error: validation.error }
    const { error } = await supabase
      .from("financial_records")
      .update({
        canceled_at: new Date().toISOString(),
        canceled_by: profile.id,
        cancel_reason: reason.trim(),
        updated_by: profile.id,
      })
      .eq("id", recordId)
      .is("canceled_at", null)
    if (error) return { error: error.message }
    await writeAudit(supabase, profile.id, "financial_record", recordId, "cancelled", {
      reason,
    })
    revalidateFinancialConsumers(clientId ?? undefined, projectId ?? undefined)
    return {
      ok: true,
      message: "Movimiento cancelado; el historial se conserva.",
    }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}
