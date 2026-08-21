/**
 * Validación de lo que llega desde el navegador.
 *
 * El criterio es de lista blanca: se copian únicamente los campos previstos y
 * todo lo demás se descarta. No alcanza con "ignorar" lo que no esperamos —
 * si un campo no se copia explícitamente, no puede filtrarse hacia el resto
 * del sistema por accidente.
 *
 * Lo que el navegador NUNCA decide: quién es, qué rol tiene, con qué sesión
 * de Hermes habla, ni qué instrucciones recibe el modelo. Todo eso lo resuelve
 * el servidor a partir de la sesión de Supabase.
 */

export const CONTEXT_TYPES = [
  "general",
  "dashboard",
  "client",
  "opportunity",
  "project",
  "finance",
  "inbox",
  "agent",
] as const

export type ContextType = (typeof CONTEXT_TYPES)[number]

/** Suficiente para una consulta larga; corta los pegados accidentales. */
export const MAX_MESSAGE_LENGTH = 8000

export type ChatRequest = {
  message: string
  /** `null` significa "abrí una conversación nueva". */
  conversationId: string | null
  context: { type: ContextType; id: string | null }
}

export type ParseResult =
  | { ok: true; value: ChatRequest }
  | { ok: false; error: string }

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function asUuid(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null
}

export function parseChatRequest(raw: unknown): ParseResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "El pedido no tiene el formato esperado." }
  }
  const input = raw as Record<string, unknown>

  if (typeof input.message !== "string") {
    return { ok: false, error: "Falta el mensaje." }
  }
  const message = input.message.trim()
  if (!message) {
    return { ok: false, error: "Escribí un mensaje." }
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: `El mensaje es demasiado largo (máximo ${MAX_MESSAGE_LENGTH} caracteres).`,
    }
  }

  // Un id presente pero mal formado es un error, no algo a ignorar: significa
  // que el cliente cree estar en una conversación que no existe.
  let conversationId: string | null = null
  if (input.conversationId != null) {
    conversationId = asUuid(input.conversationId)
    if (!conversationId) {
      return { ok: false, error: "La conversación indicada no es válida." }
    }
  }

  // El contexto es una pista de dónde está parada la persona; si viene raro se
  // degrada a "general" en vez de fallar. El backend igual revalida el id
  // contra la base antes de usarlo.
  const rawContext =
    input.context && typeof input.context === "object"
      ? (input.context as Record<string, unknown>)
      : {}
  const type = CONTEXT_TYPES.includes(rawContext.type as ContextType)
    ? (rawContext.type as ContextType)
    : "general"

  return {
    ok: true,
    value: {
      message,
      conversationId,
      context: { type, id: type === "general" ? null : asUuid(rawContext.id) },
    },
  }
}
