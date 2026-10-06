import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestDb, seedIdentities, SANTIAGO, TOMI, EXTRANO, type TestDb } from "./harness"

let db: TestDb
let prospect: string
let inbound: string
const tomorrow = new Date(Date.now() + 86400_000)
tomorrow.setUTCHours(18, 0, 0, 0)
const start = tomorrow.toISOString()
const end = new Date(tomorrow.getTime() + 20 * 60000).toISOString()
const secret = "CAMBIAR_ESTE_SECRETO"
type Result = { ok: boolean; error?: string; run_id?: string; lease_id?: string; claimed?: boolean; status?: string; appointment_id?: string; duplicate?: boolean; permitir?: boolean; queue?: { mensaje: string; phone_e164: string; tanda_id: string } }

async function command(payload: unknown, token = secret) {
  const [row] = await db.as<{ result: Result }>(null, "select public.reservas_agent_command($1,$2::jsonb) result", [token, JSON.stringify(payload)])
  return row.result
}
async function calendar(payload: unknown, user = SANTIAGO) {
  const [row] = await db.as<{ result: Result }>(user, "select public.manage_crm_calendar($1::jsonb) result", [JSON.stringify(payload)])
  return row.result
}
async function newRun() {
  const id = randomUUID()
  const [row] = await db.as<{ result: Result }>(SANTIAGO, "select public.request_reservas_agent($1,$2) result", [prospect, id])
  return row.result.run_id!
}
beforeAll(async () => {
  db = await createTestDb(); await seedIdentities(db)
  const [p] = await db.admin<{ result: { prospect_id: string; lead_id: string } }>("select public.ingest_reservas_prospect($1,$2::jsonb) result", [secret, JSON.stringify({ sheet_id: "agent-fixture", sheet_lead_id: "one", sheet_url: "https://docs.google.com/spreadsheets/d/agent-fixture/edit", empresa: "Fixture aislada", phone_e164: "+5491112345678", do_not_contact: false })])
  prospect = p.result.prospect_id
  const [account] = await db.admin<{ id: string }>("insert into public.social_accounts(zernio_account_id,platform) values('agent-wa','whatsapp') returning id")
  const [chat] = await db.admin<{ id: string }>("insert into public.social_conversations(zernio_conversation_id,social_account_id,platform,lead_id) values('agent-chat',$1,'whatsapp',$2) returning id", [account.id, p.result.lead_id])
  await db.admin("insert into public.social_messages(conversation_id,direction,body,sent_at) values($1,'outbound','Primer contacto automático',now()-interval '1 hour')", [chat.id])
  const [message] = await db.admin<{ id: string }>("insert into public.social_messages(conversation_id,direction,body) values($1,'inbound','Sí, confirmo ese horario para la reunión') returning id", [chat.id])
  inbound = message.id
}, 120_000)
afterAll(async () => { await db?.close() })

describe("shared calendar", () => {
  let appointmentId: string
  it("books once, leaves responsibility unassigned and rejects an overlapping booking", async () => {
    const request = { action: "create", request_id: randomUUID(), title: "Fixture reunión", start, end, confirmation: "pending" }
    const a = await calendar(request)
    expect(a.ok).toBe(true); appointmentId = a.appointment_id!
    expect(await calendar(request)).toMatchObject({ ok: true, duplicate: true, appointment_id: appointmentId })
    expect(await calendar({ ...request, request_id: randomUUID() }, TOMI)).toMatchObject({ ok: false, error: "slot_taken" })
    const [stored] = await db.admin<{ responsible_id: string | null; confirmation: string }>("select responsible_id,confirmation from public.crm_appointments where id=$1", [appointmentId])
    expect(stored).toEqual({ responsible_id: null, confirmation: "pending" })
  })
  it("is shared with both members and private from outsiders", async () => {
    for (const user of [SANTIAGO, TOMI]) {
      const [row] = await db.as<{ result: { appointments: unknown[] } }>(user, "select public.get_crm_calendar($1,$2) result", [start, new Date(tomorrow.getTime() + 86400_000).toISOString()])
      expect(row.result.appointments).toHaveLength(1)
    }
    expect(await db.tryAs(EXTRANO, "select public.get_crm_calendar($1,$2)", [start, end])).not.toBeNull()
    expect(await db.as(EXTRANO, "select * from public.crm_appointments")).toEqual([])
    expect(await db.tryAs(null, "select public.reservas_calendar_availability($1,$2)", [start, end])).not.toBeNull()
  })
  it("lets the team choose responsibility and confirm, and refuses a future completed meeting", async () => {
    expect(await calendar({ action: "assign", appointment_id: appointmentId, responsible_id: TOMI })).toMatchObject({ ok: true })
    expect(await calendar({ action: "confirm", appointment_id: appointmentId }, TOMI)).toMatchObject({ ok: true })
    expect(await calendar({ action: "held", appointment_id: appointmentId })).toMatchObject({ ok: false, error: "meeting_in_future" })
    expect(await calendar({ action: "cancelled", appointment_id: appointmentId })).toMatchObject({ ok: true })
    expect(await calendar({ action: "create", request_id: randomUUID(), title: "Nuevo horario libre", start, end })).toMatchObject({ ok: true })
    await db.admin("update public.crm_appointments set status='cancelled' where status='scheduled'")
  })
  it("limits duration to 15–20 minutes and rejects direct writes even for members", async () => {
    expect(await calendar({ action: "create", request_id: randomUUID(), title: "Duración inválida", start, end: new Date(tomorrow.getTime() + 30 * 60000).toISOString() })).toMatchObject({ ok: false })
    expect(await db.tryAs(TOMI, "update public.crm_appointments set title='Tampered' returning id")).toBeNull()
    const [unchanged] = await db.admin<{ n: number }>("select count(*)::int n from public.crm_appointments where title='Tampered'")
    expect(unchanged.n).toBe(0)
  })
})

describe("agent boundaries", () => {
  it("requires a member to create work and a valid secret to read scope", async () => {
    expect(await db.tryAs(EXTRANO, "select public.request_reservas_agent($1,$2)", [prospect, randomUUID()])).not.toBeNull()
    const id = await newRun()
    expect(await command({ action: "context", run_id: id }, "wrong")).toEqual({ ok: false, error: "unauthorized" })
    expect(await db.tryAs(null, "select public.reservas_agent_context($1)", [prospect])).not.toBeNull()
    expect(await command({ action: "claim", run_id: id })).toMatchObject({ ok: true, claimed: true })
    expect(await command({ action: "claim", run_id: id })).toMatchObject({ ok: true, claimed: false })
    await db.admin("update public.reservas_agent_runs set status='failed' where id=$1", [id])
  })
  it("never grants approval to n8n and rejects a foreign lease", async () => {
    const id = await newRun(), claimed = await command({ action: "claim", run_id: id })
    expect(await command({ action: "approve", run_id: id })).toMatchObject({ ok: false, error: "invalid_action" })
    expect(await command({ action: "finish", run_id: id, lease_id: randomUUID(), result: {} })).toMatchObject({ ok: false, error: "lease_conflict" })
    await command({ action: "fail", run_id: id, lease_id: claimed.lease_id })
  })
  it("refuses stale drafts when contact is blocked during analysis", async () => {
    const id = await newRun(), claimed = await command({ action: "claim", run_id: id })
    await db.admin("update public.reservas_prospects set do_not_contact=true where id=$1", [prospect])
    expect(await command({ action: "finish", run_id: id, lease_id: claimed.lease_id, result: { intent: "unknown", action: "no_action", reason: "Fixture", confidence: .5, draft: "" } })).toMatchObject({ ok: true, status: "blocked" })
    await db.admin("update public.reservas_prospects set do_not_contact=false where id=$1", [prospect])
  })
  it("requires real inbound evidence and human approval before recording a meeting atomically", async () => {
    const id = await newRun(), claimed = await command({ action: "claim", run_id: id })
    const result = { intent: "meeting", action: "book_meeting", reason: "Cliente aceptó la fecha; fixture", confidence: .9, draft: "", meeting: { start, end, evidence_message_id: String(randomUUID()) } }
    expect(await command({ action: "finish", run_id: id, lease_id: claimed.lease_id, result })).toMatchObject({ ok: false, error: "meeting_evidence_required" })
    result.meeting.evidence_message_id = inbound
    expect(await command({ action: "finish", run_id: id, lease_id: claimed.lease_id, result })).toMatchObject({ ok: true, status: "review" })
    expect(await command({ action: "book", run_id: id })).toMatchObject({ ok: false, error: "booking_not_approved" })
    await db.as(TOMI, "select public.review_reservas_agent($1,'approved','')", [id])
    const booked = await command({ action: "book", run_id: id })
    expect(booked).toMatchObject({ ok: true })
    expect(await command({ action: "book", run_id: id })).toMatchObject({ ok: true, duplicate: true, appointment_id: booked.appointment_id })
    const [counts] = await db.admin<{ n: number }>("select count(*)::int n from public.reservas_prospect_events where event_type='meeting_scheduled' and prospect_id=$1", [prospect])
    expect(counts.n).toBe(1)
  })
  it("exposes free slots without imposing office hours", async () => {
    const id = await newRun()
    const a = await command({ action: "availability", run_id: id, from: start, to: new Date(tomorrow.getTime() + 2 * 3600_000).toISOString() })
    expect(a).toMatchObject({ ok: true, configured: true, unrestricted_hours: true, duration_minutes: 20 })
    expect(await command({ action: "availability", run_id: id, from: start, to: new Date(tomorrow.getTime() + 30 * 86400_000).toISOString() })).toMatchObject({ ok: false, error: "invalid_range" })
    await db.admin("update public.reservas_agent_runs set status='failed' where id=$1", [id])
  })
  it("claims the Hermes invocation once and only under a fresh lease", async () => {
    const id = await newRun(), claimed = await command({ action: "claim", run_id: id })
    expect(await command({ action: "model_context", run_id: id, lease_id: randomUUID() })).toMatchObject({ ok: false, error: "lease_conflict" })
    expect(await command({ action: "model_context", run_id: id, lease_id: claimed.lease_id })).toMatchObject({ ok: true })
    expect(await command({ action: "model_context", run_id: id, lease_id: claimed.lease_id })).toMatchObject({ ok: false, error: "already_started" })
    expect(await command({ action: "tool_context", run_id: id, lease_id: claimed.lease_id })).toMatchObject({ ok: true })
    await db.admin("update public.reservas_prospects set do_not_contact=true where id=$1", [prospect])
    expect(await command({ action: "tool_context", run_id: id, lease_id: claimed.lease_id })).toMatchObject({ ok: false, error: "stale_or_blocked" })
    await db.admin("update public.reservas_prospects set do_not_contact=false where id=$1", [prospect])
    await command({ action: "fail", run_id: id, lease_id: claimed.lease_id })
  })
  it("transfers only an approved exact reply once and records a provider receipt without inventing messages", async () => {
    const id = await newRun(), claimed = await command({ action: "claim", run_id: id })
    const result = { intent: "interested", action: "draft_message", reason: "Fixture aislada", confidence: .8, draft: "Respuesta de prueba" }
    expect(await command({ action: "finish", run_id: id, lease_id: claimed.lease_id, result })).toMatchObject({ ok: true })
    expect(await command({ action: "dispatch", run_id: id })).toMatchObject({ ok: false, error: "message_not_approved" })
    await db.as(TOMI, "select public.review_reservas_agent($1,'approved','Texto editado por el equipo')", [id])
    const transfer = await command({ action: "dispatch", run_id: id })
    expect(transfer).toMatchObject({ ok: true, claimed: true, queue: { tanda_id: `agent:${id}`, mensaje: "Texto editado por el equipo" } })
    expect(await command({ action: "dispatch", run_id: id })).toMatchObject({ ok: true, claimed: false, status: "transferring" })
    expect(await command({ action: "queued", run_id: id, lease_id: randomUUID() })).toMatchObject({ ok: false, error: "lease_conflict" })
    expect(await command({ action: "queued", run_id: id, lease_id: transfer.lease_id })).toMatchObject({ ok: true, status: "queued" })
    const guard = { action: "send_guard", run_id: id, phone_e164: transfer.queue!.phone_e164, message: transfer.queue!.mensaje }
    expect(await command(guard)).toMatchObject({ ok: true, permitir: true })
    expect(await command({ ...guard, message: "Texto alterado" })).toMatchObject({ permitir: false })
    expect(await command({ ...guard, phone_e164: "+5491199999999" })).toMatchObject({ permitir: false })
    await db.admin("update public.reservas_prospects set do_not_contact=true where id=$1", [prospect])
    expect(await command(guard)).toMatchObject({ permitir: false })
    await db.admin("update public.reservas_prospects set do_not_contact=false where id=$1", [prospect])
    expect(await command({ action: "delivered", run_id: id, provider_message_id: "fixture-receipt" })).toMatchObject({ ok: true })
    expect(await command({ action: "delivered", run_id: id, provider_message_id: "fixture-receipt" })).toMatchObject({ ok: true, duplicate: true })
    expect(await command(guard)).toMatchObject({ permitir: false })
    const [messages] = await db.admin<{ n: number }>("select count(*)::int n from public.social_messages where direction='outbound'")
    expect(messages.n).toBe(1)
  })
  it("does not start a cold outreach agent or poll work before the first real outbound", async () => {
    await db.admin("update public.social_messages set deleted_at=now() where direction='outbound'")
    const [requested] = await db.as<{ result: Result }>(SANTIAGO, "select public.request_reservas_agent($1,$2) result", [prospect, randomUUID()])
    expect(requested.result).toMatchObject({ ok: false, error: "awaiting_first_reply" })
    const [polled] = await db.as<{ result: Result }>(null, "select public.poll_reservas_agent($1) result", [secret])
    expect(polled.result.run_id).toBeNull()
  })
})
