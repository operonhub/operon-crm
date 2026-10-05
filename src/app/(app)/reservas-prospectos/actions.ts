"use server"

import { revalidatePath } from "next/cache"
import { authorizationMessage, requireMember } from "@/lib/auth"
import type { ActionResult } from "@/lib/action-result"
import { argentineInputTimestamp } from "@/lib/reservas-sales"

export async function recordReservasMilestone(form: FormData): Promise<ActionResult> {
  let member
  try { member = await requireMember() } catch (error) { return { error: authorizationMessage(error) } }
  const prospectId = String(form.get("prospect_id") ?? "")
  const eventId = String(form.get("event_id") ?? "")
  const eventType = String(form.get("event_type") ?? "")
  const occurredAt = argentineInputTimestamp(String(form.get("occurred_at") ?? ""))
  const reason = String(form.get("reason") ?? "").trim()
  const note = String(form.get("note") ?? "").trim()
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuid.test(prospectId) || !uuid.test(eventId)) return { error: "No se pudo identificar el prospecto o el evento." }
  if (!["meeting_scheduled", "meeting_held", "meeting_cancelled", "proposal_sent", "won", "lost", "suppressed", "unsuppressed"].includes(eventType)) {
    return { error: "Elegí un hito válido." }
  }
  if (!occurredAt || Date.parse(occurredAt) > Date.now() + 300_000) return { error: "La fecha del hecho debe ser válida y no estar en el futuro." }
  if (reason.length > 500 || note.length > 2000) return { error: "El motivo o la nota supera el largo permitido." }
  if (["lost", "suppressed", "unsuppressed"].includes(eventType) && !reason) return { error: "Agregá el motivo de este cambio." }
  const scheduledFor = eventType === "meeting_scheduled"
    ? argentineInputTimestamp(String(form.get("scheduled_for") ?? "")) : null
  if (eventType === "meeting_scheduled" && (!scheduledFor || Date.parse(scheduledFor) < Date.parse(occurredAt))) {
    return { error: "La fecha confirmada de reunión debe ser posterior al momento en que se acordó." }
  }
  const { data, error } = await member.supabase.rpc("record_reservas_event", {
    p_payload: { prospect_id: prospectId, event_id: eventId, event_type: eventType,
      occurred_at: occurredAt, details: { ...(scheduledFor ? { scheduled_for: scheduledFor } : {}),
        timezone: "America/Argentina/Buenos_Aires", ...(reason ? { reason } : {}), ...(note ? { note } : {}) } },
  })
  const result = data as { ok?: boolean } | null
  if (error || !result?.ok) return { error: "No se pudo registrar el hito. Revisá los datos y reintentá." }
  revalidatePath("/reservas-prospectos")
  revalidatePath("/bandeja")
  return { ok: true }
}
