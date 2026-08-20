"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import {
  SUPPORTED_CURRENCIES,
  type FinancialRecordType,
  type SupportedCurrency,
} from "@/lib/constants"
import type { ActionResult } from "@/lib/action-result"

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
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Sesión vencida. Volvé a ingresar." }

  const concept = str(fd, "concept")
  const recordType = str(fd, "record_type") as FinancialRecordType
  const currency = str(fd, "currency") as SupportedCurrency
  const totalAmount = amount(fd, "total_amount")
  const paidAmount = amount(fd, "paid_amount")
  const dueDate = str(fd, "due_date")
  const paidAt = str(fd, "paid_at")
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
  if (!Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > totalAmount) {
    return { error: "El monto cobrado/pagado debe estar entre cero y el total." }
  }
  if (paidAmount > 0 && !paidAt) {
    return { error: "Indicá la fecha del cobro o pago registrado." }
  }

  const { error } = await supabase.from("financial_records").insert({
    concept,
    record_type: recordType,
    currency,
    total_amount: totalAmount,
    paid_amount: paidAmount,
    due_date: dueDate || null,
    paid_at: paidAmount > 0 ? paidAt : null,
    client_id: clientId || null,
    project_id: projectId || null,
    notes: notes || null,
  })
  if (error) return { error: error.message }

  revalidateFinancialConsumers(clientId, projectId)
  return { ok: true }
}

export async function updateFinancialPayment(
  recordId: string,
  totalAmount: number,
  clientId: string | null,
  projectId: string | null,
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  const supabase = await createClient()
  const paidAmount = amount(fd, "paid_amount")
  const paidAt = str(fd, "paid_at")

  if (!Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > totalAmount) {
    return { error: `Ingresá un monto entre 0 y ${totalAmount}.` }
  }
  if (paidAmount > 0 && !paidAt) {
    return { error: "Indicá la fecha del cobro o pago." }
  }

  const { error } = await supabase
    .from("financial_records")
    .update({ paid_amount: paidAmount, paid_at: paidAt || null })
    .eq("id", recordId)
  if (error) return { error: error.message }

  revalidateFinancialConsumers(clientId ?? undefined, projectId ?? undefined)
  return { ok: true }
}

export async function cancelFinancialRecord(
  recordId: string,
  clientId: string | null,
  projectId: string | null
): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("financial_records")
    .update({ canceled_at: new Date().toISOString() })
    .eq("id", recordId)
  if (error) return { error: error.message }

  revalidateFinancialConsumers(clientId ?? undefined, projectId ?? undefined)
  return { ok: true }
}
