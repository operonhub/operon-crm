"use server"

import { revalidatePath } from "next/cache"
import { authorizationMessage, requireMember } from "@/lib/auth"
import type { ActionResult } from "@/lib/action-result"
import { argentineInputTimestamp } from "@/lib/reservas-sales"

export async function prepareReservasWithAgent(form: FormData): Promise<ActionResult> {
  let member
  try { member = await requireMember() } catch (error) { return { error: authorizationMessage(error) } }
  if (process.env.RESERVAS_AGENT_READY !== "true") return { error: "Falta completar y probar la conexión del perfil de ventas de Hermes." }
  const prospectId = String(form.get("prospect_id") ?? "")
  const requestId = String(form.get("request_id") ?? "")
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuid.test(prospectId) || !uuid.test(requestId)) return { error: "Solicitud inválida." }
  const { data, error } = await member.supabase.rpc("request_reservas_agent", { p_prospect_id: prospectId, p_request_id: requestId })
  const result = data as { ok?: boolean; run_id?: string; status?: string } | null
  if (error || !result?.ok || !result.run_id) return { error: "El agente interviene después de la respuesta al primer mensaje. Revisá la conversación y si el contacto está bloqueado." }
  if (result.status !== "queued") return { ok: true }
  const token = process.env.N8N_INGEST_SECRET
  if (!token) return { error: "No está configurada la conexión con n8n." }
  try {
    const response = await fetch("https://automatizaciones-n8n.mtgb7s.easypanel.host/webhook/operon-reservas-agente", {
      method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: result.run_id }), signal: AbortSignal.timeout(15000), cache: "no-store",
    })
    const accepted = await response.json() as { ok?: boolean }
    if (!response.ok || accepted.ok !== true) return { error: "n8n no confirmó la solicitud. No se enviaron mensajes." }
  } catch { return { error: "No se pudo confirmar la respuesta de n8n. Revisá el estado antes de reintentar." } }
  revalidatePath("/reservas-prospectos")
  return { ok: true }
}

export async function reviewReservasAgent(form: FormData): Promise<ActionResult> {
  let member
  try { member = await requireMember() } catch (error) { return { error: authorizationMessage(error) } }
  const runId = String(form.get("run_id") ?? "")
  const decision = String(form.get("decision") ?? "")
  const message = String(form.get("message") ?? "").trim()
  if (!/^[0-9a-f-]{36}$/i.test(runId) || !["approved", "rejected"].includes(decision) || message.length > 2000) return { error: "Revisión inválida." }
  const { data, error } = await member.supabase.rpc("review_reservas_agent", { p_run_id: runId, p_decision: decision, p_message: message })
  const reviewed = data as { ok?: boolean; action?: string } | null
  if (error || !reviewed?.ok) return { error: "No se pudo guardar: el caso puede haber cambiado o estar bloqueado. Prepará un borrador nuevo." }
  if (decision === "approved" && reviewed.action === "book_meeting") return bookReservasMeeting(form)
  if (decision === "approved" && ["draft_message", "follow_up"].includes(reviewed.action ?? "")) return queueReservasReply(form)
  revalidatePath("/reservas-prospectos")
  return { ok: true }
}

export async function queueReservasReply(form: FormData): Promise<ActionResult> {
  let member
  try { member = await requireMember() } catch (error) { return { error: authorizationMessage(error) } }
  const runId = String(form.get("run_id") ?? "")
  const token = process.env.N8N_INGEST_SECRET
  if (!token || !/^[0-9a-f-]{36}$/i.test(runId)) return { error: "No se pudo identificar el borrador o la conexión." }
  // Server Action callers cannot transfer other people's unapproved work.
  const { data } = await member.supabase.from("reservas_agent_runs").select("approval,delivery_state").eq("id", runId).maybeSingle()
  if (!data || data.approval !== "approved") return { error: "El mensaje requiere aprobación en el CRM." }
  if (["queued", "sent"].includes(data.delivery_state)) return { ok: true }
  try {
    const response = await fetch("https://automatizaciones-n8n.mtgb7s.easypanel.host/webhook/operon-reservas-agente", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: runId, command: "queue" }), signal: AbortSignal.timeout(15000), cache: "no-store",
    })
    const result = await response.json() as { ok?: boolean; status?: string }
    if (!response.ok || !result.ok || !["queued", "sent"].includes(result.status ?? "")) return { error: "Mensaje aprobado; la cola todavía no confirmó la recepción. Revisá el estado antes de reintentar." }
  } catch { return { error: "La cola no confirmó la recepción. La aprobación está guardada; no repitas el envío manualmente." } }
  revalidatePath("/reservas-prospectos")
  return { ok: true }
}

export async function bookReservasMeeting(form: FormData): Promise<ActionResult> {
  try { await requireMember() } catch (error) { return { error: authorizationMessage(error) } }
  const runId = String(form.get("run_id") ?? "")
  const token = process.env.N8N_INGEST_SECRET
  if (!token || !/^[0-9a-f-]{36}$/i.test(runId)) return { error: "No se pudo identificar la reunión o la conexión." }
  try {
    const response = await fetch("https://automatizaciones-n8n.mtgb7s.easypanel.host/webhook/operon-reservas-agente", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: runId, command: "book" }), signal: AbortSignal.timeout(15000), cache: "no-store",
    })
    const result = await response.json() as { ok?: boolean; error?: string }
    if (!response.ok || !result.ok) return { error: result.error === "slot_taken" ? "Ese horario ya está ocupado. Coordiná otro horario." : "El borrador quedó aprobado, pero la agenda no confirmó la reunión. Podés reintentar: no se duplicará." }
  } catch { return { error: "No se pudo confirmar el guardado en la agenda. Reintentá; el pedido evita duplicados." } }
  revalidatePath("/calendario")
  revalidatePath("/reservas-prospectos")
  return { ok: true }
}

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
