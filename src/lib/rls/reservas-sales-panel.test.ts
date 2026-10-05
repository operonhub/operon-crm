import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestDb, seedIdentities, SANTIAGO, EXTRANO, type TestDb } from "./harness"
import type { ReservasPanel, ReservasExportRow } from "../reservas-sales"

let db: TestDb
const prospects: { id: string; lead_id: string }[] = []
const primaryChats: string[] = []

beforeAll(async () => {
  db = await createTestDb()
  await seedIdentities(db)
  for (let i = 0; i < 4; i++) {
    const [imported] = await db.admin<{ result: { prospect_id: string; lead_id: string } }>(
      "select public.ingest_reservas_prospect('CAMBIAR_ESTE_SECRETO',$1::jsonb) as result",
      [JSON.stringify({ sheet_id: "sales-fixture", sheet_lead_id: `row-${i}`,
        sheet_url: "https://docs.google.com/spreadsheets/d/sales-fixture/edit",
        empresa: `Alojamiento ${i}`, phone_e164: `+549111234567${i}`, do_not_contact: i === 1 })])
    prospects.push({ id: imported.result.prospect_id, lead_id: imported.result.lead_id })
  }
  const [account] = await db.admin<{ id: string }>("insert into public.social_accounts(zernio_account_id,platform) values ('wa-fixture','whatsapp') returning id")
  for (const i of [0, 1, 2]) {
    const [chat] = await db.admin<{ id: string }>(`insert into public.social_conversations
      (zernio_conversation_id,social_account_id,platform,lead_id)
      values ($1,$2,'whatsapp',$3) returning id`, [`chat-${i}`, account.id, prospects[i].lead_id])
    await db.admin(`insert into public.social_messages (conversation_id,zernio_message_id,direction,body,sent_at) values
      ($1,$2,'inbound','Respuesta sintética',now() - interval '2 hours'),
      ($1,$3,'outbound','Saliente sintético',now() - $4::interval)`,
      [chat.id, `in-${i}`, `out-${i}`, i === 2 ? "1 hour" : "3 hours"])
    primaryChats.push(chat.id)
    await db.admin(`insert into public.social_messages (conversation_id,zernio_message_id,direction,body,sent_at,delivery_status) values
      ($1,$2,'outbound','Falló',now(),'failed')`, [chat.id, `failed-${i}`])
  }
  // Another thread's outgoing message must not clear the first thread's pending reply.
  const [otherChat] = await db.admin<{ id: string }>(`insert into public.social_conversations
    (zernio_conversation_id,social_account_id,platform,lead_id) values ('chat-other',$1,'whatsapp',$2) returning id`,
    [account.id, prospects[0].lead_id])
  await db.admin(`insert into public.social_messages(conversation_id,direction,body,sent_at)
    values ($1,'outbound','Otro hilo',now() - interval '1 hour')`, [otherChat.id])
  await db.admin(`insert into public.reservas_prospect_events
    (prospect_id,source,source_event_id,event_type,actor,occurred_at,details) values
    ($1,'crm','schedule-a','meeting_scheduled','crm:test',now() - interval '1 hour',
      jsonb_build_object('scheduled_for',now() + interval '1 hour')),
    ($2,'crm','proposal-d','proposal_sent','crm:test',now() - interval '2 hours','{}'),
    ($2,'crm','won-d','won','crm:test',now() - interval '1 hour','{}')`, [prospects[0].id, prospects[3].id])
  const [op] = await db.admin<{ id: string }>(`insert into public.opportunities(lead_id,title,stage,next_action,next_action_date)
    values ($1,'Seguimiento sintético','contactado','Llamar al alojamiento',
      (now() at time zone 'America/Argentina/Buenos_Aires')::date - 1) returning id`, [prospects[0].lead_id])
  await db.admin(`insert into public.activities(opportunity_id,type,body,due_date,completed)
    values ($1,'tarea','Tarea ya completada',(now() at time zone 'America/Argentina/Buenos_Aires')::date - 3,true)`, [op.id])
  // An unrelated business must never affect this panel or export.
  const [outside] = await db.admin<{ id: string }>("insert into public.leads(external_id) values ('other-business') returning id")
  const [outsideChat] = await db.admin<{ id: string }>(`insert into public.social_conversations
    (zernio_conversation_id,social_account_id,platform,lead_id) values ('outside',$1,'whatsapp',$2) returning id`,
    [account.id, outside.id])
  await db.admin("insert into public.social_messages(conversation_id,direction,body) values ($1,'inbound','OUTSIDE SECRET')", [outsideChat.id])
}, 120_000)
afterAll(async () => { await db?.close() })

async function panel(search = "", attention = "") {
  const [result] = await db.as<{ panel: ReservasPanel }>(SANTIAGO,
    "select public.get_reservas_sales_panel(1,$1,'',$2) as panel", [search, attention])
  return result.panel
}

describe("Reservas panel reads and exports", () => {
  it("counts unique prospects and uses intersection denominators without importing other businesses", async () => {
    const data = await panel()
    expect(data.metrics).toMatchObject({ imported: 4, contacted: 3, responded: 2, scheduled: 1,
      held: 0, proposed: 1, won: 1, lost: 0, suppressed: 1, scheduled_from_replies: 1,
      proposed_from_held: 0, won_from_proposed: 1, pending: 1, overdue: 1, meeting_soon: 1 })
    expect(data.rows).toHaveLength(4)
    const active = data.rows.find(r => r.id === prospects[0].id)!
    expect(active.pending_response).toBe(true)
    expect(active.conversation_id).toBe(primaryChats[0])
    expect(active.next_action).toBe("Llamar al alojamiento")
    const suppressed = data.rows.find(r => r.id === prospects[1].id)!
    expect(suppressed.pending_response).toBe(false)
    expect(suppressed.do_not_contact).toBe(true)
  })
  it("filters the table while keeping whole-pilot metrics honest", async () => {
    const filtered = await panel("Alojamiento 0")
    expect(filtered.filtered_count).toBe(1)
    expect(filtered.metrics.imported).toBe(4)
    expect((await panel("", "pending")).filtered_count).toBe(1)
    expect((await panel("", "suppressed")).filtered_count).toBe(1)
  })
  it("rejects nonmembers and protects the invoker view through underlying RLS", async () => {
    expect(await db.tryAs(EXTRANO, "select public.get_reservas_sales_panel()")).not.toBeNull()
    expect(await db.tryAs(null, "select public.get_reservas_sales_export_page()")).not.toBeNull()
    expect(await db.as(EXTRANO, "select id from public.reservas_sales_projection")).toHaveLength(0)
  })
  it("exports only pilot messages and keeps raw IDs/delivery evidence", async () => {
    const [result] = await db.as<{ rows: ReservasExportRow[] }>(SANTIAGO,
      "select public.get_reservas_sales_export_page() as rows")
    expect(result.rows).toHaveLength(4)
    expect(JSON.stringify(result.rows)).not.toContain("OUTSIDE SECRET")
    const active = result.rows.find(r => r.id === prospects[0].id)!
    expect(active.events.some(e => e.event_type === "meeting_scheduled")).toBe(true)
    expect(active.messages.some(m => m.delivery_status === "failed")).toBe(true)
    expect(new Set(active.messages.map(m => m.id)).size).toBe(active.messages.length)
  })
  it("paginates exports past the first hundred without overlap", async () => {
    for (let i = 0; i < 101; i++) {
      await db.admin(`with l as (insert into public.leads(external_id) values ($1) returning id)
        insert into public.reservas_prospects(lead_id,sheet_id,sheet_lead_id,sheet_url,phone_e164)
        select l.id,'paging',$1,'https://docs.google.com/spreadsheets/d/paging/edit',$2 from l`,
        [`paging-${i}`, `+549120${String(i).padStart(6, "0")}`])
    }
    const [first] = await db.as<{ rows: ReservasExportRow[] }>(SANTIAGO,
      "select public.get_reservas_sales_export_page() as rows")
    expect(first.rows).toHaveLength(100)
    const [second] = await db.as<{ rows: ReservasExportRow[] }>(SANTIAGO,
      "select public.get_reservas_sales_export_page($1::uuid) as rows", [first.rows.at(-1)!.id])
    expect(second.rows).toHaveLength(5)
    expect(new Set([...first.rows, ...second.rows].map(r => r.id)).size).toBe(105)
  })
})
