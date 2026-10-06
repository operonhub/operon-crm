"use server"
import { revalidatePath } from "next/cache"
import { authorizationMessage, requireMember } from "@/lib/auth"
import { argentineInputTimestamp } from "@/lib/reservas-sales"
import type { ActionResult } from "@/lib/action-result"

export async function manageCalendar(form: FormData): Promise<ActionResult> {
  let member
  try { member = await requireMember() } catch (error) { return { error: authorizationMessage(error) } }
  const action = String(form.get("action") ?? "")
  let payload
  if (action === "create") {
    const start = argentineInputTimestamp(String(form.get("start") ?? ""))
    const duration = Number(form.get("duration"))
    const title = String(form.get("title") ?? "").trim()
    const notes = String(form.get("notes") ?? "").trim()
    const requestId = String(form.get("request_id") ?? "")
    if (!start || Date.parse(start) <= Date.now() || ![15, 20].includes(duration) || !title || title.length > 200 || notes.length > 2000 || !/^[0-9a-f-]{36}$/i.test(requestId)) return { error: "Revisá el nombre, fecha y duración de la reunión." }
    payload = { action, request_id: requestId, title, start, end: new Date(Date.parse(start) + duration * 60_000).toISOString(), notes,
      responsible_id: String(form.get("responsible_id") ?? ""), confirmation: String(form.get("confirmation") ?? "confirmed") }
  } else if (["held", "cancelled", "confirm", "assign"].includes(action)) {
    const appointmentId = String(form.get("appointment_id") ?? "")
    if (!/^[0-9a-f-]{36}$/i.test(appointmentId)) return { error: "Reunión inválida." }
    payload = { action, appointment_id: appointmentId, responsible_id: String(form.get("responsible_id") ?? "") }
  } else return { error: "Acción inválida." }
  const { data, error } = await member.supabase.rpc("manage_crm_calendar", { p_payload: payload })
  const result = data as { ok?: boolean; error?: string } | null
  if (error || !result?.ok) return { error: result?.error === "slot_taken" ? "Ese horario ya tiene una reunión. Elegí otro." : "No se pudo guardar. Revisá la fecha y el estado de la reunión." }
  revalidatePath("/calendario")
  revalidatePath("/reservas-prospectos")
  return { ok: true }
}
