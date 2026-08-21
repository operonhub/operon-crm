"use server"

import { revalidatePath } from "next/cache"
import type { ActionResult } from "@/lib/action-result"
import { writeAudit } from "@/lib/audit"
import { authorizationMessage, requireAdmin } from "@/lib/auth"
import {
  SUPPORTED_CURRENCIES,
  type FinancialRecordType,
  type SupportedCurrency,
} from "@/lib/constants"
import {
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

    const { data: record, error } = await supabase
      .from("financial_records")
      .insert({
        concept,
        record_type: recordType,
        currency,
        total_amount: totalAmount,
        paid_amount: 0,
        due_date: dueDate || null,
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
          paid_on: paidOn,
          note: "Pago inicial",
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
      .select("total_amount, paid_amount, canceled_at")
      .eq("id", recordId)
      .single()
    if (readError || !record) return { error: "Movimiento no encontrado." }
    const validation = validatePayment(record, paymentAmount)
    if (!validation.ok) return { error: validation.error }
    if (!paidOn) return { error: "Indicá la fecha del cobro o pago." }

    const { data: payment, error } = await supabase
      .from("financial_payments")
      .insert({
        financial_record_id: recordId,
        amount: paymentAmount,
        paid_on: paidOn,
        note: note || null,
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
      .select("total_amount, paid_amount, canceled_at")
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
    const { data: payment, error } = await supabase
      .from("financial_payments")
      .insert({
        financial_record_id: recordId,
        amount: delta,
        paid_on: paidOn,
        note: "Pago agregado desde edición acumulada",
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
      .select("total_amount, paid_amount, canceled_at")
      .eq("id", recordId)
      .single()
    if (readError || !record) return { error: "Movimiento no encontrado." }
    const balance = financialBalance(record)
    const validation = validatePayment(record, balance)
    if (!validation.ok) return { error: validation.error }
    const { data: payment, error } = await supabase
      .from("financial_payments")
      .insert({
        financial_record_id: recordId,
        amount: balance,
        paid_on: paidOn,
        note: "Saldo completado",
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
    const { error } = await supabase
      .from("financial_records")
      .update({
        concept,
        total_amount: totalAmount,
        currency,
        due_date: str(fd, "due_date") || null,
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
