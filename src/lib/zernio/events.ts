import { normalizePlatform, type AccountPlatform } from "./types"

/**
 * Normalización de los webhooks del inbox de Zernio.
 *
 * Módulo **puro**: sin red, sin base, sin entorno. Toda la complejidad del
 * parseo vive acá para poder probarla con Vitest, y la migración 0015 sólo
 * recibe campos ya limpios.
 *
 * Los nombres de campo salen del OpenAPI de Zernio (`zernio.com/openapi.json`,
 * leído el 2026-09-15), no de la documentación narrada. Dos diferencias que
 * importan y que no se adivinan:
 *
 *  - la dirección es `incoming`/`outgoing`, no `inbound`/`outbound`;
 *  - el texto viaja en `message.text`, y puede ser `null` cuando el mensaje es
 *    sólo un adjunto.
 */

export type MessageDirection = "inbound" | "outbound"

export type DeliveryStatus = "pending" | "sent" | "delivered" | "read" | "failed"

export type NormalizedMessage = {
  externalId: string | null
  direction: MessageDirection
  body: string | null
  attachments: unknown[] | null
  deliveryStatus: DeliveryStatus
  error: unknown | null
  sentAt: string
  deletedAt: string | null
}

export type NormalizedConversation = {
  externalId: string
  platform: AccountPlatform
  participantExternalId: string | null
  participantName: string | null
  participantHandle: string | null
  participantAvatarUrl: string | null
}

export type NormalizedEvent =
  | {
      kind: "inbox"
      eventId: string
      eventType: string
      accountExternalId: string
      conversation: NormalizedConversation
      message: NormalizedMessage | null
    }
  /** Llegó bien pero no lo materializamos (reacciones, reseñas, comentarios). */
  | { kind: "ignored"; eventId: string; eventType: string; reason: string }
  /** No se puede procesar: le falta identidad. */
  | { kind: "invalid"; reason: string }

/** Eventos del inbox que el CRM sí refleja en la Bandeja. */
const HANDLED = new Set([
  "message.received",
  "message.sent",
  "message.delivered",
  "message.read",
  "message.failed",
  "message.deleted",
  "conversation.started",
])

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Fecha ISO válida, o `null`. Una fecha inventada es peor que ninguna. */
function isoDate(value: unknown): string | null {
  const raw = str(value)
  if (!raw) return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function directionOf(value: unknown): MessageDirection {
  // `outgoing` es lo que manda el negocio; todo lo demás se trata como entrante,
  // que es el caso conservador: un mensaje del cliente nunca se pierde.
  return str(value) === "outgoing" ? "outbound" : "inbound"
}

function statusForEvent(eventType: string): DeliveryStatus {
  switch (eventType) {
    case "message.delivered":
      return "delivered"
    case "message.read":
      return "read"
    case "message.failed":
      return "failed"
    case "message.received":
      // Un entrante ya está entregado por definición: llegó.
      return "delivered"
    default:
      return "sent"
  }
}

function normalizeConversation(
  payload: Record<string, unknown>,
  fallbackPlatform: unknown
): NormalizedConversation | null {
  const conversation = asRecord(payload.conversation)
  if (!conversation) return null

  const externalId = str(conversation.id)
  if (!externalId) return null

  return {
    externalId,
    // `InboxWebhookConversation` no trae `platform`; sólo el detalle que viaja
    // en `conversation.started`. Por eso el fallback al mensaje o a la cuenta.
    platform: normalizePlatform(conversation.platform ?? fallbackPlatform),
    participantExternalId: str(conversation.participantId),
    participantName: str(conversation.participantName),
    participantHandle: str(conversation.participantUsername),
    participantAvatarUrl: str(conversation.participantPicture),
  }
}

function normalizeMessage(
  payload: Record<string, unknown>,
  eventType: string
): NormalizedMessage | null {
  const message = asRecord(payload.message)
  if (!message) return null

  const attachments = Array.isArray(message.attachments) ? message.attachments : null

  return {
    externalId: str(message.id),
    direction: directionOf(message.direction),
    body: str(message.text),
    attachments: attachments && attachments.length > 0 ? attachments : null,
    deliveryStatus: statusForEvent(eventType),
    error: eventType === "message.failed" ? (payload.error ?? null) : null,
    // `statusAt` en los acuses, `sentAt` en el mensaje. Si ninguna sirve, se usa
    // el `timestamp` del evento antes que inventar la hora actual.
    sentAt:
      isoDate(message.sentAt) ??
      isoDate(payload.statusAt) ??
      isoDate(payload.timestamp) ??
      new Date().toISOString(),
    deletedAt: eventType === "message.deleted" ? isoDate(payload.deletedAt) : null,
  }
}

/**
 * Convierte el cuerpo crudo de un webhook en algo que la base pueda escribir.
 *
 * Nunca lanza: un evento raro tiene que poder responderse con 200 y quedar
 * anotado. Si el endpoint devolviera un error, Zernio lo reintentaría siete
 * veces y el problema seguiría igual.
 */
export function normalizeInboxEvent(payload: unknown): NormalizedEvent {
  const root = asRecord(payload)
  if (!root) return { kind: "invalid", reason: "El cuerpo no es un objeto JSON." }

  const eventId = str(root.id)
  const eventType = str(root.event)

  // Sin id no hay deduplicación posible, y sin deduplicación un reintento
  // duplicaría el mensaje en la Bandeja.
  if (!eventId) return { kind: "invalid", reason: "El evento no trae `id`." }
  if (!eventType) {
    return { kind: "ignored", eventId, eventType: "desconocido", reason: "Sin tipo de evento." }
  }

  if (!HANDLED.has(eventType)) {
    return { kind: "ignored", eventId, eventType, reason: "Tipo de evento no reflejado en la Bandeja." }
  }

  const account = asRecord(root.account)
  const accountExternalId = account ? (str(account.accountId) ?? str(account.id)) : null
  if (!accountExternalId) {
    return { kind: "ignored", eventId, eventType, reason: "El evento no identifica la cuenta." }
  }

  const message = asRecord(root.message)
  const conversation = normalizeConversation(
    root,
    message?.platform ?? account?.platform
  )
  if (!conversation) {
    return { kind: "ignored", eventId, eventType, reason: "El evento no identifica la conversación." }
  }

  return {
    kind: "inbox",
    eventId,
    eventType,
    accountExternalId,
    conversation,
    message:
      eventType === "conversation.started" ? null : normalizeMessage(root, eventType),
  }
}

// ------------------------------------------------------------
// La misma información, por la otra puerta
// ------------------------------------------------------------
/**
 * Los endpoints REST del inbox devuelven **otra forma** que los webhooks, para
 * los mismos datos. No es un detalle menor: el texto del mensaje viaja en
 * `message` por REST y en `text` por webhook, y el sobre es `{ messages: [] }`
 * contra `{ data: [] }` según el endpoint.
 *
 * Por eso el backfill inicial tiene su propio normalizador en vez de reusar el
 * de los webhooks. Ambos desembocan en los mismos tipos, así que de la base
 * para arriba la diferencia no existe.
 *
 * Verificado contra `zernio.com/openapi.json` el 2026-09-15.
 */
export function normalizeRestConversation(input: unknown): NormalizedConversation | null {
  const raw = asRecord(input)
  if (!raw) return null

  const externalId = str(raw.id)
  if (!externalId) return null

  return {
    externalId,
    platform: normalizePlatform(raw.platform),
    participantExternalId: str(raw.participantId),
    participantName: str(raw.participantName),
    participantHandle: str(raw.participantUsername),
    participantAvatarUrl: str(raw.participantPicture),
  }
}

export function normalizeRestMessage(input: unknown): NormalizedMessage | null {
  const raw = asRecord(input)
  if (!raw) return null

  const attachments = Array.isArray(raw.attachments) ? raw.attachments : null
  // `deleted` existe como estado de entrega por REST pero no en nuestro check:
  // un mensaje borrado se marca con `deletedAt`, que es donde ya lo modelamos.
  const rawStatus = str(raw.deliveryStatus)
  const deliveryStatus: DeliveryStatus =
    rawStatus === "delivered" || rawStatus === "read" || rawStatus === "failed"
      ? rawStatus
      : "sent"

  return {
    externalId: str(raw.id),
    direction: directionOf(raw.direction),
    body: str(raw.message),
    attachments: attachments && attachments.length > 0 ? attachments : null,
    deliveryStatus,
    error: raw.deliveryError ?? null,
    sentAt: isoDate(raw.sentAt) ?? isoDate(raw.createdAt) ?? new Date().toISOString(),
    deletedAt: raw.isDeleted === true ? (isoDate(raw.deletedAt) ?? null) : null,
  }
}

/** Saca la lista del sobre, tolerando las variantes que usa cada endpoint. */
export function parseListPayload(payload: unknown, ...keys: string[]): unknown[] | null {
  if (Array.isArray(payload)) return payload

  const root = asRecord(payload)
  if (!root) return null

  for (const key of keys) {
    if (Array.isArray(root[key])) return root[key] as unknown[]
  }
  return null
}

/**
 * Ventana de servicio de WhatsApp: 24 horas desde el último mensaje del cliente.
 *
 * Fuera de esa ventana Meta sólo acepta plantillas aprobadas, así que la UI
 * tiene que avisarlo **antes** de que alguien escriba una respuesta que se va a
 * rechazar. En Instagram no aplica: devuelve siempre `open`.
 */
export type MessagingWindow =
  | { state: "open"; hoursLeft: number }
  | { state: "closing"; hoursLeft: number }
  | { state: "expired" }
  | { state: "not_applicable" }

const WINDOW_HOURS = 24
/** Menos de 2 horas: vale la pena mostrarlo distinto para que no se pase. */
const CLOSING_HOURS = 2

export function messagingWindow(
  platform: string,
  lastInboundAt: string | null,
  now: Date = new Date()
): MessagingWindow {
  if (normalizePlatform(platform) !== "whatsapp") return { state: "not_applicable" }
  if (!lastInboundAt) return { state: "expired" }

  const last = new Date(lastInboundAt)
  if (Number.isNaN(last.getTime())) return { state: "expired" }

  const hoursLeft = WINDOW_HOURS - (now.getTime() - last.getTime()) / 3_600_000
  if (hoursLeft <= 0) return { state: "expired" }
  if (hoursLeft <= CLOSING_HOURS) return { state: "closing", hoursLeft }
  return { state: "open", hoursLeft }
}
