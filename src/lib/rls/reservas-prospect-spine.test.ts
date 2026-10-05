import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestDb, seedIdentities, SANTIAGO, EXTRANO, type TestDb } from "./harness"

const SECRET = "CAMBIAR_ESTE_SECRETO" // Fixture de PGlite; nunca es un secreto real.
let db: TestDb

beforeAll(async () => {
  db = await createTestDb()
  await seedIdentities(db)
}, 120_000)
afterAll(async () => { await db?.close() })

async function importProspect(blocked = false) {
  const payload = {
    kind: "prospect", sheet_id: "synthetic-sheet", sheet_lead_id: "lead-001",
    sheet_url: "https://docs.google.com/spreadsheets/d/synthetic-sheet/edit#gid=0",
    empresa: "Hostería de prueba", phone_e164: "+5491123456789",
    do_not_contact: blocked, suppression_reason: blocked ? "Solicitó baja" : null,
    actor: "n8n:sheet-importer",
  }
  const [row] = await db.admin<{ result: Record<string, unknown> }>(
    "select public.ingest_reservas_prospect($1,$2::jsonb) as result",
    [SECRET, JSON.stringify(payload)]
  )
  return row.result
}

describe("Operon Reservas prospect spine", () => {
  it("links one synthetic Sheet lead, WhatsApp thread and dated funnel without duplicate writes", async () => {
    const first = await importProspect()
    expect(first.ok).toBe(true)
    expect(first.action).toBe("created")
    const second = await importProspect()
    expect(second.prospect_id).toBe(first.prospect_id)
    expect(second.lead_id).toBe(first.lead_id)
    expect(second.action).toBe("updated")
    const [invalidPhone] = await db.admin<{ result: Record<string, unknown> }>(
      "select public.ingest_reservas_prospect($1,$2::jsonb) as result", [SECRET,
        JSON.stringify({ sheet_id: "synthetic-sheet", sheet_lead_id: "lead-001",
          sheet_url: "https://docs.google.com/spreadsheets/d/synthetic-sheet/edit",
          empresa: "Prueba", phone_e164: "1123456789", do_not_contact: false })])
    expect(invalidPhone.result.error).toBe("invalid_prospect")
    const [duplicatePhone] = await db.admin<{ result: Record<string, unknown> }>(
      "select public.ingest_reservas_prospect($1,$2::jsonb) as result", [SECRET,
        JSON.stringify({ sheet_id: "synthetic-sheet", sheet_lead_id: "another-row",
          sheet_url: "https://docs.google.com/spreadsheets/d/synthetic-sheet/edit",
          empresa: "Otro alojamiento", phone_e164: "+5491123456789", do_not_contact: false })])
    expect(duplicatePhone.result.error).toBe("identity_conflict")
    expect(await db.admin("select id from public.reservas_prospects")).toHaveLength(1)
    expect(await db.admin("select id from public.leads where external_id like 'reservas:sheet:%'")).toHaveLength(1)

    const [account] = await db.admin<{ id: string }>(
      "insert into public.social_accounts(zernio_account_id,platform,username) values ('wa_test','whatsapp','operon') returning id"
    )
    const [chat] = await db.admin<{ id: string }>(
      `insert into public.social_conversations(zernio_conversation_id,social_account_id,platform,participant_external_id)
       values ('chat_test',$1,'whatsapp','5491123456789') returning id`, [account.id]
    )
    const [linked] = await db.as<{ result: Record<string, unknown> }>(SANTIAGO,
      "select public.link_reservas_conversation($1::uuid,$2::uuid) as result",
      [first.prospect_id, chat.id])
    expect(linked.result.ok).toBe(true)
    await db.as(SANTIAGO,
      "select public.link_reservas_conversation($1::uuid,$2::uuid)",
      [first.prospect_id, chat.id])
    expect(await db.admin("select id from public.reservas_prospect_events where event_type = 'chat_linked'"))
      .toHaveLength(1)

    await db.admin(`insert into public.social_messages
      (conversation_id,zernio_message_id,direction,body,sent_at) values
      ($1,'out_1','outbound','Hola, ¿reciben reservas por web?', '2026-10-01T18:00:00Z'),
      ($1,'in_1','inbound','La mayoría por WhatsApp', '2026-10-01T18:10:00Z')`, [chat.id])
    const eventBase = { kind: "event", prospect_id: first.prospect_id,
      event_id: "workflow8:meeting-1", event_type: "meeting_scheduled",
      actor: "n8n:workflow-8", occurred_at: "2026-10-01T19:00:00Z",
      details: { scheduled_for: "2026-10-02T20:00:00Z" } }
    const [event] = await db.admin<{ result: Record<string, unknown> }>(
      "select public.ingest_reservas_event($1,$2::jsonb) as result",
      [SECRET, JSON.stringify(eventBase)])
    expect(event.result.status).toBe("created")
    const [retry] = await db.admin<{ result: Record<string, unknown> }>(
      "select public.ingest_reservas_event($1,$2::jsonb) as result",
      [SECRET, JSON.stringify(eventBase)])
    expect(retry.result.status).toBe("duplicate")
    for (const [payload, error] of [
      [{ ...eventBase, details: { scheduled_for: "2026-10-03T20:00:00Z" } }, "event_id_conflict"],
      [{ ...eventBase, actor: "n8n:other-workflow" }, "event_id_conflict"],
      [{ ...eventBase, event_type: "reply_received" }, "invalid_event"],
      [{ ...eventBase, event_type: null }, "invalid_event"],
      [{ ...eventBase, occurred_at: "2026-10-01T19:00:00" }, "invalid_timestamp"],
    ] as const) {
      const [rejected] = await db.admin<{ result: Record<string, unknown> }>(
        "select public.ingest_reservas_event($1,$2::jsonb) as result",
        [SECRET, JSON.stringify(payload)])
      expect(rejected.result.error).toBe(error)
    }

    for (const [event_type, event_id] of [
      ["meeting_held", "meeting-held-1"], ["proposal_sent", "proposal-1"],
      ["won", "outcome-1"],
    ]) {
      const [result] = await db.as<{ result: Record<string, unknown> }>(SANTIAGO,
        "select public.record_reservas_event($1::jsonb) as result",
        [JSON.stringify({ prospect_id: first.prospect_id, event_type, event_id,
          occurred_at: "2026-10-02T20:00:00Z", details: {} })])
      expect(result.result.ok).toBe(true)
    }
    expect(await db.admin("select id from public.social_messages where conversation_id = $1", [chat.id]))
      .toHaveLength(2)
    expect(await db.admin("select id from public.reservas_prospect_events where event_type = 'meeting_scheduled'"))
      .toHaveLength(1)
    expect(await db.as(null, "select id from public.reservas_prospects")).toHaveLength(0)
    expect(await db.as(EXTRANO, "select id from public.reservas_prospects")).toHaveLength(0)
    expect(await db.tryAs(EXTRANO, "select public.record_reservas_event('{}'::jsonb)"))
      .not.toBeNull()
    expect(await db.tryAs(null, "select public.record_reservas_event('{}'::jsonb)"))
      .not.toBeNull()
  })

  it("keeps do-not-contact sticky across Sheet retries; only a member can release it", async () => {
    const suppressed = await importProspect(true)
    expect(suppressed.do_not_contact).toBe(true)
    expect((await importProspect(false)).do_not_contact).toBe(true)
    const [blocked] = await db.as<{ blocked: boolean }>(SANTIAGO,
      "select public.reservas_contact_blocked($1::uuid) as blocked", [suppressed.lead_id])
    expect(blocked.blocked).toBe(true)
    const [state] = await db.admin<{ result: Record<string, unknown> }>(
      "select public.get_reservas_contact_state($1,$2::uuid) as result",
      [SECRET, suppressed.prospect_id])
    expect(state.result.do_not_contact).toBe(true)
    expect(state.result.phone_e164).toBe("+5491123456789")
    const [denied] = await db.admin<{ result: Record<string, unknown> }>(
      "select public.get_reservas_contact_state($1,$2::uuid) as result",
      ["wrong", suppressed.prospect_id])
    expect(denied.result.ok).toBe(false)
    const [released] = await db.as<{ result: Record<string, unknown> }>(SANTIAGO,
      "select public.record_reservas_event($1::jsonb) as result",
      [JSON.stringify({ prospect_id: suppressed.prospect_id, event_id: "release-1",
        event_type: "unsuppressed", occurred_at: "2026-10-02T21:00:00Z",
        details: { reason: "Consentimiento confirmado por Santiago" } })])
    expect(released.result.ok).toBe(true)
    const [unblocked] = await db.as<{ blocked: boolean }>(SANTIAGO,
      "select public.reservas_contact_blocked($1::uuid) as blocked", [suppressed.lead_id])
    expect(unblocked.blocked).toBe(false)
    expect((await importProspect(true)).do_not_contact).toBe(true)
    expect(await db.admin("select id from public.reservas_prospect_events where event_type = 'suppressed'"))
      .toHaveLength(2)
    await importProspect(true)
    expect(await db.admin("select id from public.reservas_prospect_events where event_type = 'suppressed'"))
      .toHaveLength(2)
  })
})
