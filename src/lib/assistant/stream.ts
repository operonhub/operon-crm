/**
 * Traducción del streaming de Hermes a eventos que el CRM entiende.
 *
 * Todo lo de este archivo es lógica pura: recibe texto, devuelve eventos. Eso
 * permite probar los casos que rompen los streamings en producción —un JSON
 * cortado al medio, un keep-alive, un upstream que devuelve 429— sin depender
 * de que Hermes esté levantado.
 *
 * Regla que atraviesa el archivo: **un fallo nunca se convierte en texto**.
 * Si algo salió mal, sale un evento de error y la interfaz lo muestra como
 * error. Nunca se inventa una respuesta.
 */

export type AssistantEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; status: string }
  | { type: "done" }
  | { type: "error"; code: string; message: string }

/** Códigos de fallo que sabemos explicar en castellano. */
export type UpstreamFailure = number | "timeout" | "network" | "unconfigured"

// --------------------------------------------------------------- SSE

/**
 * Separa un buffer de Server-Sent Events en payloads completos.
 *
 * Devuelve además el resto sin terminar: el llamador tiene que volver a
 * pasarlo con el chunk siguiente. Sin esto, un mensaje que se parte justo en
 * la mitad de un JSON se pierde o corrompe el stream.
 */
export function splitSseChunk(buffer: string): {
  events: string[]
  rest: string
} {
  // Un evento SSE termina en línea en blanco, y el salto puede ser \n o \r\n.
  const parts = buffer.split(/\r?\n\r?\n/)
  const rest = parts.pop() ?? ""
  const events: string[] = []

  for (const part of parts) {
    for (const line of part.split(/\r?\n/)) {
      // Las líneas que empiezan con ':' son comentarios/keep-alive.
      if (!line.startsWith("data:")) continue
      const payload = line.slice(5).trim()
      if (payload) events.push(payload)
    }
  }

  return { events, rest }
}

// ------------------------------------------------------- mapeo de eventos

type ChatChunk = {
  choices?: { delta?: { content?: string } }[]
  object?: string
  tool?: string
  status?: string
  error?: { message?: string; type?: string; code?: string }
}

/**
 * Convierte un payload de Hermes en un evento del asistente, o `null` si no
 * aporta nada (delta vacío, keep-alive, evento desconocido, JSON roto).
 *
 * Descartar en silencio es deliberado: un evento que no entendemos no puede
 * cortar una respuesta que por lo demás viene bien.
 */
export function mapHermesEvent(payload: string): AssistantEvent | null {
  if (payload === "[DONE]") return { type: "done" }

  let data: ChatChunk
  try {
    data = JSON.parse(payload) as ChatChunk
  } catch {
    return null
  }

  if (data.error) {
    // El mensaje del upstream puede traer detalles de infraestructura, así que
    // no se propaga: se traduce por código.
    return describeUpstreamFailure(upstreamCodeOf(data.error))
  }

  if (data.object === "hermes.tool.progress" && data.tool) {
    return { type: "tool", name: data.tool, status: data.status ?? "running" }
  }

  const delta = data.choices?.[0]?.delta?.content
  if (typeof delta === "string" && delta.length > 0) {
    return { type: "text", delta }
  }

  return null
}

function upstreamCodeOf(error: NonNullable<ChatChunk["error"]>): UpstreamFailure {
  const raw = `${error.type ?? ""} ${error.code ?? ""}`.toLowerCase()
  if (raw.includes("rate")) return 429
  if (raw.includes("auth") || raw.includes("api_key")) return 401
  if (raw.includes("timeout")) return "timeout"
  return 500
}

// ------------------------------------------------------- errores legibles

const MESSAGES: Record<string, string> = {
  unconfigured:
    "Operon IA todavía no está conectada. Falta configurar el acceso al asistente.",
  timeout:
    "Operon IA tardó demasiado en responder. Probá de nuevo; si sigue igual, puede estar sobrecargada.",
  network:
    "No se pudo conectar con Operon IA. Puede ser un problema de red o que el servicio esté caído.",
  "401": "Operon IA rechazó la credencial del CRM. Hay que revisar la configuración del acceso.",
  "403": "Operon IA rechazó la credencial del CRM. Hay que revisar la configuración del acceso.",
  "429":
    "Operon IA está saturada en este momento. Probá de nuevo en un minuto.",
  "500": "Operon IA no pudo procesar el pedido. Fue un error del asistente, no tuyo.",
  "502": "Operon IA no está disponible en este momento.",
  "503": "Operon IA no está disponible en este momento.",
  "504":
    "Operon IA tardó demasiado en responder. Probá de nuevo; si sigue igual, puede estar sobrecargada.",
}

/**
 * Traduce un fallo a algo que se le puede mostrar a una persona.
 *
 * Toma únicamente el código: el cuerpo crudo del upstream nunca entra acá,
 * porque puede contener nombres de variables, rutas internas o partes de una
 * credencial. Lo verifica `provider.test.ts` con una respuesta real.
 */
export function describeUpstreamFailure(
  code: UpstreamFailure
): Extract<AssistantEvent, { type: "error" }> {
  const key = String(code)
  return {
    type: "error",
    code: typeof code === "number" ? "upstream" : code,
    message:
      MESSAGES[key] ??
      "Operon IA no pudo responder. Volvé a intentar en un momento.",
  }
}

// ------------------------------------------------ eventos hacia el cliente

/**
 * Inverso exacto de `sse()` en `route.ts`.
 *
 * Vive junto a `splitSseChunk` a propósito: el serializador del servidor y el
 * parser del navegador tienen que poder leerse de un vistazo, porque si se
 * separan el chat deja de renderizar sin dar ningún error.
 *
 * Es estricto por diseño: valida cada campo en vez de confiar en la forma. Un
 * evento futuro que no entienda se descarta, en lugar de llegar a la pantalla
 * como `[object Object]`.
 */
export function parseAssistantEvent(payload: string): AssistantEvent | null {
  let data: unknown
  try {
    data = JSON.parse(payload)
  } catch {
    return null
  }
  if (!data || typeof data !== "object") return null

  const event = data as Record<string, unknown>
  switch (event.type) {
    case "text":
      return typeof event.delta === "string" && event.delta.length > 0
        ? { type: "text", delta: event.delta }
        : null
    case "tool":
      return typeof event.name === "string" && typeof event.status === "string"
        ? { type: "tool", name: event.name, status: event.status }
        : null
    case "done":
      return { type: "done" }
    case "error":
      return typeof event.code === "string" && typeof event.message === "string"
        ? { type: "error", code: event.code, message: event.message }
        : null
    default:
      return null
  }
}
