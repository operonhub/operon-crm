import { describe, expect, it } from "vitest"
import {
  splitSseChunk,
  mapHermesEvent,
  describeUpstreamFailure,
  type AssistantEvent,
} from "./stream"

/** Junta el texto de una tanda de eventos, como haría la UI. */
function textoDe(events: AssistantEvent[]): string {
  return events
    .filter((e): e is Extract<AssistantEvent, { type: "text" }> => e.type === "text")
    .map((e) => e.delta)
    .join("")
}

function parsear(payloads: string[]): AssistantEvent[] {
  return payloads
    .map(mapHermesEvent)
    .filter((e): e is AssistantEvent => e !== null)
}

describe("splitSseChunk", () => {
  it("separa eventos completos y guarda el resto", () => {
    const { events, rest } = splitSseChunk('data: {"a":1}\n\ndata: {"b":2}\n\ndata: {"c"')
    expect(events).toEqual(['{"a":1}', '{"b":2}'])
    expect(rest).toBe('data: {"c"')
  })

  it("un evento partido al medio se reconstruye con el chunk siguiente", () => {
    // Este es el caso que rompe los streamings mal hechos: el corte de red
    // cae justo en la mitad de un JSON.
    const primero = splitSseChunk('data: {"choices":[{"delta":{"cont')
    expect(primero.events).toEqual([])

    const segundo = splitSseChunk(primero.rest + 'ent":"hola"}}]}\n\n')
    expect(segundo.events).toEqual(['{"choices":[{"delta":{"content":"hola"}}]}'])
    expect(segundo.rest).toBe("")
  })

  it("tolera saltos de línea estilo Windows", () => {
    const { events } = splitSseChunk('data: {"a":1}\r\n\r\n')
    expect(events).toEqual(['{"a":1}'])
  })

  it("ignora comentarios y líneas de keep-alive", () => {
    const { events } = splitSseChunk(': keep-alive\n\ndata: {"a":1}\n\n')
    expect(events).toEqual(['{"a":1}'])
  })

  it("sin datos devuelve vacío y no rompe", () => {
    expect(splitSseChunk("")).toEqual({ events: [], rest: "" })
  })
})

describe("mapHermesEvent", () => {
  it("convierte un chunk de texto en un evento de texto", () => {
    const e = mapHermesEvent(
      JSON.stringify({ choices: [{ delta: { content: "Hola" } }] })
    )
    expect(e).toEqual({ type: "text", delta: "Hola" })
  })

  it("reconoce el fin del stream", () => {
    expect(mapHermesEvent("[DONE]")).toEqual({ type: "done" })
  })

  it("reporta la actividad de herramientas", () => {
    const e = mapHermesEvent(
      JSON.stringify({
        object: "hermes.tool.progress",
        tool: "web_search",
        status: "running",
      })
    )
    expect(e).toEqual({ type: "tool", name: "web_search", status: "running" })
  })

  it("un delta vacío no genera ruido", () => {
    expect(
      mapHermesEvent(JSON.stringify({ choices: [{ delta: {} }] }))
    ).toBeNull()
  })

  it("un JSON malformado se descarta sin romper el stream", () => {
    expect(mapHermesEvent("{esto no es json")).toBeNull()
  })

  it("un evento desconocido se ignora", () => {
    expect(mapHermesEvent(JSON.stringify({ object: "algo.nuevo" }))).toBeNull()
  })

  it("un error del upstream se convierte en evento de error", () => {
    const e = mapHermesEvent(
      JSON.stringify({ error: { message: "rate limited", type: "rate_limit" } })
    )
    expect(e).toEqual({
      type: "error",
      code: "upstream",
      message: "Operon IA está saturada en este momento. Probá de nuevo en un minuto.",
    })
  })

  it("reconstruye una respuesta completa a partir de sus deltas", () => {
    const payloads = [
      JSON.stringify({ choices: [{ delta: { content: "Buen" } }] }),
      JSON.stringify({ choices: [{ delta: { content: " día" } }] }),
      JSON.stringify({ choices: [{ delta: { content: ", Santiago." } }] }),
      "[DONE]",
    ]
    const events = parsear(payloads)
    expect(textoDe(events)).toBe("Buen día, Santiago.")
    expect(events.at(-1)).toEqual({ type: "done" })
  })
})

describe("describeUpstreamFailure", () => {
  it("traduce cada código a algo accionable, sin jerga", () => {
    expect(describeUpstreamFailure(401).message).toMatch(/credencial|autenticar/i)
    expect(describeUpstreamFailure(429).message).toMatch(/saturad|espera|minuto/i)
    expect(describeUpstreamFailure(500).message).toMatch(/no pudo|error/i)
    expect(describeUpstreamFailure(503).message).toMatch(/no está disponible|disponible/i)
  })

  it("un timeout se explica como tal", () => {
    expect(describeUpstreamFailure("timeout").message).toMatch(/tard|demor/i)
  })

  it("una caída de red no se disfraza de respuesta", () => {
    const e = describeUpstreamFailure("network")
    expect(e.type).toBe("error")
    expect(e.message).toMatch(/no se pudo conectar|conexión/i)
  })

  it("todo fallo es siempre un evento de error, nunca texto", () => {
    for (const code of [401, 403, 429, 500, 502, 503, "timeout", "network"] as const) {
      expect(describeUpstreamFailure(code).type).toBe("error")
    }
  })
})
