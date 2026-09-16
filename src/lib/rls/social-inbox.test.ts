import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest"
import {
  createTestDb,
  seedIdentities,
  resetState,
  SANTIAGO,
  TOMI,
  type TestDb,
} from "./harness"

/**
 * Bandeja externa (migración 0015): políticas y, sobre todo, el RPC de ingesta.
 *
 * Esto no prueba "que el SQL parsee": ejecuta `ingest_social_event` contra un
 * Postgres real y verifica lo que de verdad importa — que un reintento de
 * Zernio no duplique un mensaje, que un entrante no se pueda falsificar desde
 * la app, y que los contadores de la conversación queden bien.
 */

const SECRETO = "secreto-de-webhook-para-las-pruebas"
const CUENTA_ZERNIO = "acc_wa_1"

let db: TestDb

beforeAll(async () => {
  db = await createTestDb()
  await seedIdentities(db)
}, 120_000)

beforeEach(async () => {
  await resetState(db)
  await db.admin("delete from public.social_messages")
  await db.admin("delete from public.social_conversations")
  await db.admin("delete from public.social_webhook_events")
  await db.admin("delete from public.social_accounts")
  await db.admin("delete from public.ingest_errors")
  await db.admin("update public.ingest_config set zernio_webhook_secret = $1 where id = 1", [
    SECRETO,
  ])
  await db.admin(
    `insert into public.social_accounts (zernio_account_id, platform, username)
     values ($1,'whatsapp','operon')`,
    [CUENTA_ZERNIO]
  )
})

afterAll(async () => {
  await db?.close()
})

type IngestResult = { status: string; conversationId?: string }

/** Llama al RPC como lo haría el route handler. */
async function ingest(options: {
  secret?: string
  eventId: string
  eventType?: string
  accountExternalId?: string | null
  conversation?: Record<string, unknown> | null
  message?: Record<string, unknown> | null
}): Promise<IngestResult> {
  const conversation =
    options.conversation === undefined
      ? {
          externalId: "conv_1",
          platform: "whatsapp",
          participantExternalId: "u_1",
          participantName: "Lucía",
          participantHandle: "lu.viajes",
          participantAvatarUrl: null,
        }
      : options.conversation

  const [row] = await db.admin<{ result: IngestResult }>(
    `select public.ingest_social_event($1,$2,$3,$4,$5,$6,$7) as result`,
    [
      options.secret ?? SECRETO,
      options.eventId,
      options.eventType ?? "message.received",
      JSON.stringify({ id: options.eventId }),
      options.accountExternalId === undefined ? CUENTA_ZERNIO : options.accountExternalId,
      conversation === null ? null : JSON.stringify(conversation),
      options.message === null || options.message === undefined
        ? null
        : JSON.stringify(options.message),
    ]
  )
  return row.result
}

const entrante = (overrides: Record<string, unknown> = {}) => ({
  externalId: "msg_1",
  direction: "inbound",
  body: "Hola, quiero una web",
  deliveryStatus: "delivered",
  sentAt: "2026-09-15T18:30:00.000Z",
  ...overrides,
})

async function conversationRow() {
  const [row] = await db.admin<{
    id: string
    unread_count: number
    status: string
    last_inbound_at: string | null
    last_message_preview: string | null
  }>(
    `select id, unread_count, status, last_inbound_at, last_message_preview
     from public.social_conversations where zernio_conversation_id = 'conv_1'`
  )
  return row
}

describe("ingest_social_event — seguridad", () => {
  it("rechaza un secreto incorrecto sin escribir nada", async () => {
    const res = await ingest({ eventId: "evt_1", secret: "secreto-equivocado", message: entrante() })

    expect(res.status).toBe("unauthorized")
    expect(await db.admin("select id from public.social_conversations")).toHaveLength(0)
    expect(await db.admin("select id from public.social_webhook_events")).toHaveLength(0)
  })

  it("rechaza cuando la base no tiene secreto configurado", async () => {
    // Estado real de un entorno recién migrado: la columna existe pero vacía.
    await db.admin("update public.ingest_config set zernio_webhook_secret = null where id = 1")
    const res = await ingest({ eventId: "evt_1", message: entrante() })
    expect(res.status).toBe("unauthorized")
  })
})

describe("ingest_social_event — idempotencia", () => {
  it("crea la conversación y el mensaje en el primer evento", async () => {
    const res = await ingest({ eventId: "evt_1", message: entrante() })

    expect(res.status).toBe("processed")
    const conv = await conversationRow()
    expect(conv.unread_count).toBe(1)
    expect(conv.last_message_preview).toBe("Hola, quiero una web")
    expect(conv.last_inbound_at).not.toBeNull()
    expect(await db.admin("select id from public.social_messages")).toHaveLength(1)
  })

  it("el mismo evento dos veces no duplica el mensaje", async () => {
    // Zernio entrega at-least-once: esto pasa de verdad, no es hipotético.
    await ingest({ eventId: "evt_1", message: entrante() })
    const segundo = await ingest({ eventId: "evt_1", message: entrante() })

    expect(segundo.status).toBe("duplicate")
    expect(await db.admin("select id from public.social_messages")).toHaveLength(1)
    expect((await conversationRow()).unread_count).toBe(1)
  })

  it("dos eventos distintos con el mismo mensaje tampoco lo duplican", async () => {
    // Pasa cuando el `message.sent` llega después de que la app ya lo guardó.
    await ingest({ eventId: "evt_1", message: entrante() })
    await ingest({
      eventId: "evt_2",
      eventType: "message.delivered",
      message: entrante({ deliveryStatus: "delivered", body: null }),
    })

    const mensajes = await db.admin<{ delivery_status: string }>(
      "select delivery_status from public.social_messages"
    )
    expect(mensajes).toHaveLength(1)
    expect(mensajes[0].delivery_status).toBe("delivered")
  })

  it("un acuse posterior avanza el estado sin reescribir el texto", async () => {
    await ingest({ eventId: "evt_1", message: entrante({ deliveryStatus: "sent" }) })
    await ingest({
      eventId: "evt_2",
      eventType: "message.read",
      message: entrante({ deliveryStatus: "read", body: "TEXTO ADULTERADO" }),
    })

    const [msg] = await db.admin<{ body: string; delivery_status: string }>(
      "select body, delivery_status from public.social_messages"
    )
    expect(msg.delivery_status).toBe("read")
    expect(msg.body).toBe("Hola, quiero una web")
  })
})

describe("ingest_social_event — ids reales de Instagram", () => {
  // Un id de mensaje de Instagram real mide 164 caracteres (Meta codifica la
  // cuenta, el hilo y el mensaje). Con el tope original de 128, cada mensaje de
  // Instagram rompía el check y el RPC deshacía la conversación entera.
  const ID_INSTAGRAM = `aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODQxNDQwNTU2OTI2NjY2`.padEnd(164, "Q")

  it("acepta un mensaje con id de 164 caracteres", async () => {
    const res = await ingest({
      eventId: `backfill:${ID_INSTAGRAM}`,
      conversation: {
        externalId: "17841440556926666",
        platform: "instagram",
        participantExternalId: "u_ig",
        participantName: "Santiago Guatelli",
        participantHandle: null,
        participantAvatarUrl: null,
      },
      message: entrante({ externalId: ID_INSTAGRAM, body: "Cómo está el ig" }),
    })

    expect(res.status).toBe("processed")
    const [msg] = await db.admin<{ largo: number }>(
      "select length(zernio_message_id) as largo from public.social_messages"
    )
    expect(msg.largo).toBe(164)
  })
})

describe("ingest_social_event — estado de la conversación", () => {
  it("un saliente no suma al contador de sin leer", async () => {
    await ingest({
      eventId: "evt_1",
      eventType: "message.sent",
      message: entrante({ externalId: "msg_out", direction: "outbound", body: "Hola Lucía" }),
    })

    const conv = await conversationRow()
    expect(conv.unread_count).toBe(0)
    expect(conv.last_inbound_at).toBeNull()
  })

  it("un entrante reabre un hilo que se había dado por resuelto", async () => {
    await ingest({ eventId: "evt_1", message: entrante() })
    await db.admin("update public.social_conversations set status = 'resolved'")

    await ingest({ eventId: "evt_2", message: entrante({ externalId: "msg_2", body: "¿Hola?" }) })

    const conv = await conversationRow()
    expect(conv.status).toBe("open")
    expect(conv.unread_count).toBe(2)
  })

  it("un saliente NO reabre un hilo resuelto", async () => {
    await ingest({ eventId: "evt_1", message: entrante() })
    await db.admin("update public.social_conversations set status = 'resolved'")

    await ingest({
      eventId: "evt_2",
      eventType: "message.sent",
      message: entrante({ externalId: "msg_out", direction: "outbound", body: "Cerramos" }),
    })

    expect((await conversationRow()).status).toBe("resolved")
  })

  it("actualiza el nombre del participante sin borrarlo con un null", async () => {
    await ingest({ eventId: "evt_1", message: entrante() })
    await ingest({
      eventId: "evt_2",
      conversation: {
        externalId: "conv_1",
        platform: "whatsapp",
        participantExternalId: "u_1",
        participantName: null,
        participantHandle: null,
        participantAvatarUrl: null,
      },
      message: entrante({ externalId: "msg_2" }),
    })

    const [row] = await db.admin<{ participant_name: string }>(
      "select participant_name from public.social_conversations"
    )
    expect(row.participant_name).toBe("Lucía")
  })

  it("guarda el evento pero no materializa nada si la cuenta es desconocida", async () => {
    const res = await ingest({
      eventId: "evt_1",
      accountExternalId: "acc_que_no_existe",
      message: entrante(),
    })

    expect(res.status).toBe("ignored")
    expect(await db.admin("select id from public.social_conversations")).toHaveLength(0)

    const [evento] = await db.admin<{ status: string; error_message: string }>(
      "select status, error_message from public.social_webhook_events"
    )
    expect(evento.status).toBe("ignored")
    expect(evento.error_message).toContain("sincronizá")
  })

  it("conversation.started abre el hilo sin mensajes", async () => {
    const res = await ingest({
      eventId: "evt_1",
      eventType: "conversation.started",
      message: null,
    })

    expect(res.status).toBe("processed")
    expect(await db.admin("select id from public.social_conversations")).toHaveLength(1)
    expect(await db.admin("select id from public.social_messages")).toHaveLength(0)
    expect((await conversationRow()).unread_count).toBe(0)
  })
})

describe("políticas de la Bandeja externa", () => {
  beforeEach(async () => {
    await ingest({ eventId: "evt_1", message: entrante() })
  })

  it("el equipo lee las conversaciones y los mensajes", async () => {
    expect(await db.as(TOMI, "select id from public.social_conversations")).toHaveLength(1)
    expect(await db.as(TOMI, "select id from public.social_messages")).toHaveLength(1)
  })

  it("un anónimo no lee ni una conversación ni un mensaje", async () => {
    expect(await db.as(null, "select id from public.social_conversations")).toHaveLength(0)
    expect(await db.as(null, "select id from public.social_messages")).toHaveLength(0)
  })

  it("un miembro puede asignar, resolver y enlazar la conversación", async () => {
    const error = await db.tryAs(
      TOMI,
      "update public.social_conversations set status = 'resolved', assigned_to = $1",
      [TOMI]
    )
    expect(error).toBeNull()
  })

  it("un miembro puede registrar un mensaje SALIENTE", async () => {
    const conv = await conversationRow()
    const error = await db.tryAs(
      SANTIAGO,
      `insert into public.social_messages (conversation_id, direction, body, sent_by)
       values ($1,'outbound','Te paso la propuesta',$2)`,
      [conv.id, SANTIAGO]
    )
    expect(error).toBeNull()
  })

  it("un miembro NO puede fabricar un mensaje ENTRANTE", async () => {
    // Lo que dijo un cliente es evidencia: entra por el webhook o no entra.
    const conv = await conversationRow()
    const error = await db.tryAs(
      SANTIAGO,
      `insert into public.social_messages (conversation_id, direction, body)
       values ($1,'inbound','esto no lo dijo el cliente')`,
      [conv.id]
    )
    expect(error).not.toBeNull()
    expect(await db.admin("select id from public.social_messages")).toHaveLength(1)
  })

  it("nadie edita ni borra un mensaje ya registrado", async () => {
    await db.tryAs(SANTIAGO, "update public.social_messages set body = 'editado'")
    await db.tryAs(SANTIAGO, "delete from public.social_messages")

    const [msg] = await db.admin<{ body: string }>("select body from public.social_messages")
    expect(msg.body).toBe("Hola, quiero una web")
  })

  it("nadie crea conversaciones a mano", async () => {
    const error = await db.tryAs(
      SANTIAGO,
      `insert into public.social_conversations
         (zernio_conversation_id, social_account_id, platform)
       values ('conv_falsa', (select id from public.social_accounts limit 1), 'whatsapp')`
    )
    expect(error).not.toBeNull()
  })
})
