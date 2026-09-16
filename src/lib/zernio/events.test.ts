import { describe, expect, it } from "vitest"
import { messagingWindow, normalizeInboxEvent } from "./events"

/**
 * Los payloads replican el esquema real del OpenAPI de Zernio
 * (`WebhookPayloadMessage`, `WebhookPayloadMessageSent`, etc.).
 */
function mensajeRecibido(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_001",
    event: "message.received",
    message: {
      id: "msg_001",
      conversationId: "conv_001",
      platform: "whatsapp",
      platformMessageId: "wamid.ABC",
      direction: "incoming",
      text: "Hola, quiero una web para mi cabaña",
      attachments: [],
      sender: { id: "u_1", name: "Lucía", phoneNumber: "+5491122334455" },
      sentAt: "2026-09-15T18:30:00.000Z",
      isRead: false,
    },
    conversation: {
      id: "conv_001",
      platformConversationId: "5491122334455",
      participantId: "u_1",
      participantName: "Lucía",
      participantUsername: "lu.viajes",
      participantPicture: "https://cdn.example/lu.jpg",
      status: "active",
    },
    account: {
      id: "acc_wa_1",
      accountId: "acc_wa_1",
      profileId: "prof_1",
      platform: "whatsapp",
      username: "operon",
    },
    timestamp: "2026-09-15T18:30:01.000Z",
    ...overrides,
  }
}

describe("normalizeInboxEvent — mensaje entrante", () => {
  it("normaliza un mensaje de WhatsApp completo", () => {
    const evento = normalizeInboxEvent(mensajeRecibido())

    expect(evento.kind).toBe("inbox")
    if (evento.kind !== "inbox") return

    expect(evento.eventId).toBe("evt_001")
    expect(evento.accountExternalId).toBe("acc_wa_1")
    expect(evento.conversation).toEqual({
      externalId: "conv_001",
      platform: "whatsapp",
      participantExternalId: "u_1",
      participantName: "Lucía",
      participantHandle: "lu.viajes",
      participantAvatarUrl: "https://cdn.example/lu.jpg",
    })
    expect(evento.message).toMatchObject({
      externalId: "msg_001",
      direction: "inbound",
      body: "Hola, quiero una web para mi cabaña",
      deliveryStatus: "delivered",
      sentAt: "2026-09-15T18:30:00.000Z",
    })
  })

  it("traduce `incoming`/`outgoing` a la dirección del CRM", () => {
    // Es la diferencia de vocabulario que no se adivina leyendo la doc narrada.
    const saliente = normalizeInboxEvent(
      mensajeRecibido({
        event: "message.sent",
        message: { ...mensajeRecibido().message, direction: "outgoing" },
      })
    )
    expect(saliente.kind === "inbox" && saliente.message?.direction).toBe("outbound")
  })

  it("ante una dirección desconocida asume entrante", () => {
    // El caso conservador: un mensaje del cliente nunca se pierde.
    const evento = normalizeInboxEvent(
      mensajeRecibido({ message: { ...mensajeRecibido().message, direction: "??" } })
    )
    expect(evento.kind === "inbox" && evento.message?.direction).toBe("inbound")
  })

  it("acepta un mensaje que es sólo adjunto, sin texto", () => {
    const evento = normalizeInboxEvent(
      mensajeRecibido({
        message: {
          ...mensajeRecibido().message,
          text: null,
          attachments: [{ type: "image", url: "https://cdn.example/foto.jpg" }],
        },
      })
    )
    expect(evento.kind).toBe("inbox")
    if (evento.kind !== "inbox") return
    expect(evento.message?.body).toBeNull()
    expect(evento.message?.attachments).toHaveLength(1)
  })

  it("deja los adjuntos en null cuando el array viene vacío", () => {
    // Un array vacío en la base ocuparía lugar y mentiría sobre el contenido.
    const evento = normalizeInboxEvent(mensajeRecibido())
    expect(evento.kind === "inbox" && evento.message?.attachments).toBeNull()
  })
})

describe("normalizeInboxEvent — ciclo de vida", () => {
  it("conversation.started abre el hilo sin mensaje", () => {
    const evento = normalizeInboxEvent({
      id: "evt_002",
      event: "conversation.started",
      conversation: {
        id: "conv_002",
        platform: "instagram",
        platformConversationId: "ig_1",
        participantName: "Mati",
        status: "active",
      },
      account: { id: "acc_ig_1", accountId: "acc_ig_1", platform: "instagram", username: "operonhub" },
      startedAt: "2026-09-15T18:00:00.000Z",
      timestamp: "2026-09-15T18:00:00.000Z",
    })

    expect(evento.kind).toBe("inbox")
    if (evento.kind !== "inbox") return
    expect(evento.message).toBeNull()
    expect(evento.conversation.platform).toBe("instagram")
  })

  it("los acuses de entrega traen el estado correcto", () => {
    for (const [event, status] of [
      ["message.delivered", "delivered"],
      ["message.read", "read"],
      ["message.failed", "failed"],
    ] as const) {
      const evento = normalizeInboxEvent(
        mensajeRecibido({ event, statusAt: "2026-09-15T18:31:00.000Z" })
      )
      expect(evento.kind === "inbox" && evento.message?.deliveryStatus).toBe(status)
    }
  })

  it("sólo el fallo arrastra el error de la plataforma", () => {
    const fallo = normalizeInboxEvent(
      mensajeRecibido({ event: "message.failed", error: { code: 131026 } })
    )
    expect(fallo.kind === "inbox" && fallo.message?.error).toEqual({ code: 131026 })

    const ok = normalizeInboxEvent(mensajeRecibido({ error: { code: 131026 } }))
    expect(ok.kind === "inbox" && ok.message?.error).toBeNull()
  })

  it("message.deleted marca la fecha de borrado", () => {
    const evento = normalizeInboxEvent(
      mensajeRecibido({ event: "message.deleted", deletedAt: "2026-09-15T19:00:00.000Z" })
    )
    expect(evento.kind === "inbox" && evento.message?.deletedAt).toBe(
      "2026-09-15T19:00:00.000Z"
    )
  })
})

describe("normalizeInboxEvent — lo que no se procesa", () => {
  it("un evento sin id es inválido: sin él no hay deduplicación", () => {
    const evento = normalizeInboxEvent({ event: "message.received" })
    expect(evento.kind).toBe("invalid")
  })

  it("un cuerpo que no es objeto es inválido", () => {
    expect(normalizeInboxEvent("hola").kind).toBe("invalid")
    expect(normalizeInboxEvent(null).kind).toBe("invalid")
    expect(normalizeInboxEvent([1, 2]).kind).toBe("invalid")
  })

  it("una reacción se ignora, pero se anota", () => {
    // No se refleja en la Bandeja, y sobre todo NO se trata como un DM:
    // un pulgar arriba no es un mensaje que haya que responder.
    const evento = normalizeInboxEvent(mensajeRecibido({ event: "reaction.received" }))
    expect(evento.kind).toBe("ignored")
    if (evento.kind !== "ignored") return
    expect(evento.eventId).toBe("evt_001")
  })

  it("se ignora si no identifica la cuenta", () => {
    const evento = normalizeInboxEvent(mensajeRecibido({ account: { platform: "whatsapp" } }))
    expect(evento.kind).toBe("ignored")
  })

  it("se ignora si no identifica la conversación", () => {
    const evento = normalizeInboxEvent(mensajeRecibido({ conversation: { status: "active" } }))
    expect(evento.kind).toBe("ignored")
  })

  it("nunca lanza, por más roto que venga el cuerpo", () => {
    // Un throw sería un 500, y un 500 hace que Zernio reintente 7 veces.
    const basura = [undefined, 42, { id: 5 }, { id: "e", event: 7 }, { id: "e", event: "message.received" }]
    for (const caso of basura) {
      expect(() => normalizeInboxEvent(caso)).not.toThrow()
    }
  })

  it("una fecha inválida no se convierte en fecha inventada", () => {
    const evento = normalizeInboxEvent(
      mensajeRecibido({
        message: { ...mensajeRecibido().message, sentAt: "no-es-fecha" },
        timestamp: "2026-09-15T20:00:00.000Z",
      })
    )
    // Cae al timestamp del evento, que sí es válido.
    expect(evento.kind === "inbox" && evento.message?.sentAt).toBe("2026-09-15T20:00:00.000Z")
  })
})

describe("messagingWindow", () => {
  const AHORA = new Date("2026-09-15T20:00:00.000Z")

  it("Instagram no tiene ventana de 24h", () => {
    expect(messagingWindow("instagram", "2026-09-10T00:00:00.000Z", AHORA)).toEqual({
      state: "not_applicable",
    })
  })

  it("abierta cuando el cliente escribió hace poco", () => {
    const w = messagingWindow("whatsapp", "2026-09-15T19:00:00.000Z", AHORA)
    expect(w.state).toBe("open")
    if (w.state === "open") expect(Math.round(w.hoursLeft)).toBe(23)
  })

  it("por cerrarse cuando quedan menos de dos horas", () => {
    const w = messagingWindow("whatsapp", "2026-09-14T21:00:00.000Z", AHORA)
    expect(w.state).toBe("closing")
  })

  it("vencida pasadas las 24 horas", () => {
    expect(messagingWindow("whatsapp", "2026-09-14T19:00:00.000Z", AHORA)).toEqual({
      state: "expired",
    })
  })

  it("sin mensaje entrante se considera vencida", () => {
    // Nunca escribió: no hay ventana de servicio que aprovechar.
    expect(messagingWindow("whatsapp", null, AHORA)).toEqual({ state: "expired" })
  })

  it("una fecha corrupta se trata como vencida, no como abierta", () => {
    // Fallar hacia el lado seguro: mejor pedir plantilla de más que que Meta
    // rechace el mensaje y el cliente se quede sin respuesta.
    expect(messagingWindow("whatsapp", "cualquier cosa", AHORA)).toEqual({ state: "expired" })
  })
})
