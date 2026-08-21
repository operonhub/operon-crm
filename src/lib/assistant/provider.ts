import { sessionKeyForUser, type HermesConfig } from "./config"
import {
  describeUpstreamFailure,
  mapHermesEvent,
  splitSseChunk,
  type AssistantEvent,
} from "./stream"

/**
 * Cliente de Hermes.
 *
 * La UI nunca llega hasta acá: esto corre en el servidor, detrás del Route
 * Handler que ya verificó la sesión de Supabase. El `userId` que recibe es el
 * de la sesión autenticada, nunca uno enviado por el navegador.
 *
 * `fetch` se inyecta para poder probar los fallos —401, 429, red caída,
 * stream cortado— sin depender de que Hermes esté levantado.
 */
export type StreamMessage = { role: "user" | "assistant"; content: string }

export type StreamInput = {
  instructions: string
  messages: StreamMessage[]
  /** Identidad real, resuelta en el servidor desde Supabase Auth. */
  userId: string
  /** Agrupa la transcripción en Hermes. Es el id de nuestra conversación. */
  conversationId: string
  signal?: AbortSignal
}

export type StreamDeps = {
  config: HermesConfig
  fetch?: typeof fetch
  /** Corta el pedido si Hermes no responde. */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 60_000

export async function* streamFromHermes(
  input: StreamInput,
  deps: StreamDeps
): AsyncIterable<AssistantEvent> {
  const { config } = deps

  // Sin configuración no se intenta la conexión: se informa y se corta.
  if (!config.configured) {
    yield describeUpstreamFailure("unconfigured")
    return
  }

  const doFetch = deps.fetch ?? fetch
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  try {
    let response: Response
    try {
      response = await doFetch(`${config.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
          // Transcripción: agrupa los mensajes de esta conversación.
          "X-Hermes-Session-Id": input.conversationId,
          // Memoria de largo plazo: aísla a cada persona del equipo.
          "X-Hermes-Session-Key": sessionKeyForUser(input.userId),
        },
        body: JSON.stringify({
          stream: true,
          messages: [
            { role: "system", content: input.instructions },
            ...input.messages,
          ],
        }),
        signal: input.signal ?? timeout.signal,
      })
    } catch (error) {
      // El mensaje del error puede contener la URL o la credencial: se descarta.
      yield describeUpstreamFailure(
        (error as Error)?.name === "AbortError" ? "timeout" : "network"
      )
      return
    }

    if (!response.ok) {
      yield describeUpstreamFailure(response.status)
      return
    }

    if (!response.body) {
      yield describeUpstreamFailure(500)
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let sawDone = false

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const { events, rest } = splitSseChunk(buffer)
        buffer = rest

        for (const payload of events) {
          const event = mapHermesEvent(payload)
          if (!event) continue
          if (event.type === "done") {
            sawDone = true
            yield event
            return
          }
          yield event
        }
      }
    } catch {
      yield describeUpstreamFailure("network")
      return
    }

    // El upstream cerró sin mandar [DONE]: la respuesta quedó incompleta y hay
    // que decirlo, no dejar que parezca terminada.
    if (!sawDone) {
      yield {
        type: "error",
        code: "truncated",
        message:
          "La respuesta se cortó antes de terminar. Volvé a preguntar para obtenerla completa.",
      }
    }
  } finally {
    clearTimeout(timer)
  }
}
