import type { ZernioConfig } from "./config"
import {
  parseContentPayload,
  parseFollowerStats,
  parseStoriesPayload,
  type ContentSnapshot,
  type FollowerStats,
  type NormalizedStory,
} from "./content"
import {
  normalizeRestConversation,
  normalizeRestMessage,
  parseListPayload,
  type NormalizedConversation,
  type NormalizedMessage,
} from "./events"
import {
  parseAccountsPayload,
  parseAnalyticsAccess,
  type ZernioAccount,
} from "./types"

/**
 * Cliente HTTP de Zernio.
 *
 * Tres reglas, heredadas de `src/lib/assistant/provider.ts`:
 *
 *  1. **El cuerpo de error de Zernio nunca llega a la UI.** Puede traer la URL
 *     con la clave, el nombre del recurso o detalles de la cuenta de Meta. Se
 *     traduce a un mensaje fijo en castellano por código.
 *  2. **`fetch` se inyecta**, para poder probar 429, 5xx, timeout y red caída
 *     sin depender de que Zernio esté arriba —que hoy, sin API key, es el caso—.
 *  3. **Sin configuración no se intenta la conexión**: se devuelve
 *     `unconfigured` y la pantalla lo explica.
 */

export type ZernioFailureCode =
  | "unconfigured"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "upstream"
  | "timeout"
  | "network"
  | "malformed"

export type ZernioFailure = {
  ok: false
  code: ZernioFailureCode
  message: string
  /** Sólo en 429: lo que Zernio pide esperar, en segundos. */
  retryAfterSeconds?: number
}

export type ZernioResult<T> = { ok: true; data: T } | ZernioFailure

export type ZernioDeps = {
  config: ZernioConfig
  fetch?: typeof fetch
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 20_000

/**
 * Mensajes fijos. Cada uno dice qué pasó y qué hacer, porque el destinatario es
 * Santiago o Tomi mirando una pantalla, no un log.
 */
export function describeZernioFailure(
  code: ZernioFailureCode | number
): ZernioFailure {
  switch (code) {
    case "unconfigured":
      return {
        ok: false,
        code: "unconfigured",
        message: "Zernio no está configurado todavía.",
      }
    case 401:
    case "unauthorized":
      return {
        ok: false,
        code: "unauthorized",
        message:
          "Zernio rechazó la clave. Verificá ZERNIO_API_KEY en el entorno del servidor.",
      }
    case 403:
    case "forbidden":
      return {
        ok: false,
        code: "forbidden",
        message:
          "Tu plan de Zernio no habilita esta función. La Bandeja y las analíticas se contratan aparte.",
      }
    case 404:
    case "not_found":
      return {
        ok: false,
        code: "not_found",
        message: "Zernio no encontró ese recurso. Puede haberse desconectado la cuenta.",
      }
    case 429:
    case "rate_limited":
      return {
        ok: false,
        code: "rate_limited",
        message: "Zernio pidió esperar por límite de pedidos. Se reintenta solo.",
      }
    case "timeout":
      return {
        ok: false,
        code: "timeout",
        message: "Zernio tardó demasiado en responder.",
      }
    case "network":
      return {
        ok: false,
        code: "network",
        message: "No se pudo llegar a Zernio. Revisá la conexión del servidor.",
      }
    case "malformed":
      return {
        ok: false,
        code: "malformed",
        message:
          "Zernio respondió con un formato inesperado. No se guardó nada para no corromper los datos.",
      }
    default:
      return {
        ok: false,
        code: "upstream",
        message: "Zernio respondió con un error. Volvé a intentar en unos minutos.",
      }
  }
}

/**
 * `Retry-After` puede venir en segundos o como fecha HTTP. Se acepta lo primero
 * y se ignora lo segundo: un número negativo o absurdo no sirve para esperar.
 */
export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value.trim())
  if (!Number.isFinite(seconds) || seconds < 0) return undefined
  return Math.min(Math.trunc(seconds), 3600)
}

export type ZernioRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE"
  query?: Record<string, string | number | null | undefined>
  body?: unknown
  /** Evita duplicados si un POST se reintenta (lo exige el envío de mensajes). */
  idempotencyKey?: string
  signal?: AbortSignal
}

/** Pedido crudo. Devuelve el JSON sin interpretar: cada llamador lo normaliza. */
export async function zernioRequest(
  path: string,
  options: ZernioRequestOptions,
  deps: ZernioDeps
): Promise<ZernioResult<unknown>> {
  const { config } = deps
  if (!config.configured) return describeZernioFailure("unconfigured")

  const doFetch = deps.fetch ?? fetch
  const url = new URL(`${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`)
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== null && value !== undefined && value !== "") {
      url.searchParams.set(key, String(value))
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    Accept: "application/json",
  }
  if (options.body !== undefined) headers["Content-Type"] = "application/json"
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey

  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  try {
    let response: Response
    try {
      response = await doFetch(url.toString(), {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal ?? timeout.signal,
      })
    } catch (error) {
      // El mensaje del error puede contener la URL completa, y la URL puede
      // llevar identificadores de cuenta. Se descarta entero.
      return describeZernioFailure(
        (error as Error)?.name === "AbortError" ? "timeout" : "network"
      )
    }

    if (!response.ok) {
      const failure = describeZernioFailure(response.status)
      if (failure.code === "rate_limited") {
        const retryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After"))
        return retryAfterSeconds === undefined
          ? failure
          : { ...failure, retryAfterSeconds }
      }
      return failure
    }

    try {
      return { ok: true, data: (await response.json()) as unknown }
    } catch {
      return describeZernioFailure("malformed")
    }
  } finally {
    clearTimeout(timer)
  }
}

export type AccountsSnapshot = {
  accounts: ZernioAccount[]
  /** `null` cuando la respuesta no lo informa: "no sé" no es "no tiene". */
  hasAnalyticsAccess: boolean | null
}

/**
 * Cuentas conectadas.
 *
 * Si hay `ZERNIO_PROFILE_ID` se filtra por él; si no, se traen todas y la
 * pantalla de Conexiones muestra lo que haya. Para el caso de Operon —un solo
 * profile— ambas cosas dan lo mismo, pero filtrar deja el camino hecho para
 * cuando cada cliente tenga el suyo.
 */
export async function listAccounts(
  deps: ZernioDeps
): Promise<ZernioResult<AccountsSnapshot>> {
  const profileId = deps.config.configured ? deps.config.profileId : null

  const response = await zernioRequest(
    "/accounts",
    { query: { profileId, limit: 100, page: 1 } },
    deps
  )
  if (!response.ok) return response

  const accounts = parseAccountsPayload(response.data)
  if (accounts === null) return describeZernioFailure("malformed")

  return {
    ok: true,
    data: { accounts, hasAnalyticsAccess: parseAnalyticsAccess(response.data) },
  }
}

// ------------------------------------------------------------
// Inbox
// ------------------------------------------------------------

export type ConversationPage = {
  conversations: NormalizedConversation[]
  nextCursor: string | null
}

/**
 * Conversaciones del inbox, para el backfill inicial.
 *
 * Hace falta porque el historial anterior a conectar la cuenta **no dispara
 * webhooks**: Zernio replica los DMs que Meta ya tenía, pero los marca como
 * leídos y no emite ni `conversation.started` ni `message.received`. Sin esta
 * llamada, la Bandeja arrancaría vacía aunque haya años de conversaciones.
 */
export async function listConversations(
  deps: ZernioDeps,
  options: { accountId?: string; cursor?: string; limit?: number } = {}
): Promise<ZernioResult<ConversationPage>> {
  const profileId = deps.config.configured ? deps.config.profileId : null

  const response = await zernioRequest(
    "/inbox/conversations",
    {
      query: {
        profileId,
        accountId: options.accountId,
        cursor: options.cursor,
        limit: options.limit ?? 50,
      },
    },
    deps
  )
  if (!response.ok) return response

  const list = parseListPayload(response.data, "data", "conversations")
  if (list === null) return describeZernioFailure("malformed")

  const root = response.data as { pagination?: { nextCursor?: string | null } } | null

  return {
    ok: true,
    data: {
      conversations: list
        .map(normalizeRestConversation)
        .filter((item): item is NormalizedConversation => item !== null),
      nextCursor: root?.pagination?.nextCursor ?? null,
    },
  }
}

export type MessagePage = {
  messages: NormalizedMessage[]
  nextCursor: string | null
}

export async function listMessages(
  deps: ZernioDeps,
  options: { conversationId: string; accountId: string; cursor?: string; limit?: number }
): Promise<ZernioResult<MessagePage>> {
  const response = await zernioRequest(
    `/inbox/conversations/${encodeURIComponent(options.conversationId)}/messages`,
    {
      query: {
        accountId: options.accountId,
        cursor: options.cursor,
        limit: options.limit ?? 50,
      },
    },
    deps
  )
  if (!response.ok) return response

  const list = parseListPayload(response.data, "messages", "data")
  if (list === null) return describeZernioFailure("malformed")

  const root = response.data as { pagination?: { nextCursor?: string | null } } | null

  return {
    ok: true,
    data: {
      messages: list
        .map(normalizeRestMessage)
        .filter((item): item is NormalizedMessage => item !== null),
      nextCursor: root?.pagination?.nextCursor ?? null,
    },
  }
}

/**
 * Envía un mensaje a una conversación existente.
 *
 * `Idempotency-Key` no es opcional en la práctica: si el envío se corta por
 * timeout no hay forma de saber si Zernio lo recibió, y sin la clave un
 * reintento le mandaría el mensaje dos veces al cliente. Con ella, Zernio
 * responde lo mismo que la primera vez.
 */
export async function sendMessage(
  deps: ZernioDeps,
  options: {
    conversationId: string
    accountId: string
    body: string
    idempotencyKey: string
  }
): Promise<ZernioResult<{ messageId: string | null }>> {
  const response = await zernioRequest(
    `/inbox/conversations/${encodeURIComponent(options.conversationId)}/messages`,
    {
      method: "POST",
      body: { accountId: options.accountId, message: options.body },
      idempotencyKey: options.idempotencyKey,
    },
    deps
  )
  if (!response.ok) return response

  const root = response.data as
    | { data?: { messageId?: string }; messageId?: string }
    | null

  return {
    ok: true,
    data: { messageId: root?.data?.messageId ?? root?.messageId ?? null },
  }
}

// ------------------------------------------------------------
// Contenido y métricas
// ------------------------------------------------------------

/**
 * Publicaciones con sus métricas.
 *
 * `/analytics` sólo lista los posts para los que Zernio ya consiguió insights
 * de Instagram, que pueden ser bastantes menos que los publicados. Por eso el
 * snapshot devuelve además `totalPosts`: sin ese número la pantalla mostraría
 * 3 de 12 publicaciones como si fueran todas.
 */
export async function listContent(
  deps: ZernioDeps,
  options: { accountId: string; limit?: number }
): Promise<ZernioResult<ContentSnapshot>> {
  const response = await zernioRequest(
    "/analytics",
    {
      query: {
        platform: "instagram",
        accountId: options.accountId,
        limit: options.limit ?? 100,
      },
    },
    deps
  )
  if (!response.ok) return response

  const snapshot = parseContentPayload(response.data)
  if (snapshot === null) return describeZernioFailure("malformed")

  return { ok: true, data: snapshot }
}

/**
 * Historias activas.
 *
 * Instagram sólo expone las de las últimas 24 horas y Zernio no guarda
 * histórico, así que esta llamada es la única oportunidad de capturarlas. Lo
 * que no se fotografíe antes de que expiren se pierde para siempre.
 */
export async function listStories(
  deps: ZernioDeps,
  options: { accountId: string }
): Promise<ZernioResult<NormalizedStory[]>> {
  const response = await zernioRequest(
    `/accounts/${encodeURIComponent(options.accountId)}/instagram/stories`,
    {},
    deps
  )
  if (!response.ok) return response

  const stories = parseStoriesPayload(response.data)
  if (stories === null) return describeZernioFailure("malformed")

  return { ok: true, data: stories }
}

/** Historia de seguidores. Devuelve nulls hasta que el fotógrafo diario corra. */
export async function getFollowerStats(
  deps: ZernioDeps,
  options: { accountId: string }
): Promise<ZernioResult<FollowerStats>> {
  const response = await zernioRequest(
    "/analytics/instagram/follower-history",
    { query: { accountId: options.accountId } },
    deps
  )
  if (!response.ok) return response

  const stats = parseFollowerStats(response.data)
  if (stats === null) return describeZernioFailure("malformed")

  return { ok: true, data: stats }
}
