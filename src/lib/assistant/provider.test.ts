import { describe, expect, it } from "vitest"
import { readHermesConfig, sessionKeyForUser } from "./config"
import { streamFromHermes } from "./provider"
import type { AssistantEvent } from "./stream"

const SANTIAGO = "11111111-1111-1111-1111-111111111111"
const TOMI = "22222222-2222-2222-2222-222222222222"
const CLAVE = "clave-de-prueba-con-mas-de-16-caracteres"

const ENV_OK = {
  HERMES_API_URL: "http://127.0.0.1:8642",
  HERMES_API_KEY: CLAVE,
}

/** Respuesta SSE falsa, para no depender de que Hermes esté levantado. */
function sseResponse(payloads: string[], status = 200): Response {
  const body = payloads.map((p) => `data: ${p}\n\n`).join("")
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  })
}

async function recolectar(
  iter: AsyncIterable<AssistantEvent>
): Promise<AssistantEvent[]> {
  const out: AssistantEvent[] = []
  for await (const e of iter) out.push(e)
  return out
}

function entrada(overrides: Partial<Parameters<typeof streamFromHermes>[0]> = {}) {
  return {
    instructions: "Sos JARVIS.",
    messages: [{ role: "user" as const, content: "Hola" }],
    userId: SANTIAGO,
    conversationId: "conv-1",
    ...overrides,
  }
}

describe("configuración", () => {
  it("sin variables, dice honestamente que no está configurada", () => {
    const cfg = readHermesConfig({})
    expect(cfg.configured).toBe(false)
  })

  it("una clave demasiado corta no cuenta como configurada", () => {
    const cfg = readHermesConfig({ ...ENV_OK, HERMES_API_KEY: "corta" })
    expect(cfg.configured).toBe(false)
  })

  it("con las variables completas, queda configurada", () => {
    const cfg = readHermesConfig(ENV_OK)
    expect(cfg.configured).toBe(true)
  })

  it("no acepta la clave desde una variable pública del navegador", () => {
    const cfg = readHermesConfig({
      HERMES_API_URL: ENV_OK.HERMES_API_URL,
      NEXT_PUBLIC_HERMES_API_KEY: CLAVE,
    })
    expect(cfg.configured).toBe(false)
  })
})

describe("separación de identidad", () => {
  it("la misma persona siempre obtiene la misma clave de sesión", () => {
    expect(sessionKeyForUser(SANTIAGO)).toBe(sessionKeyForUser(SANTIAGO))
  })

  it("dos personas nunca comparten clave de sesión", () => {
    expect(sessionKeyForUser(SANTIAGO)).not.toBe(sessionKeyForUser(TOMI))
  })

  it("la clave no expone el identificador del usuario", () => {
    expect(sessionKeyForUser(SANTIAGO)).not.toContain(SANTIAGO)
  })
})

describe("streaming", () => {
  it("convierte los deltas en texto y termina", async () => {
    const fetchFalso = async () =>
      sseResponse([
        JSON.stringify({ choices: [{ delta: { content: "Buen día" } }] }),
        JSON.stringify({ choices: [{ delta: { content: ", Santiago." } }] }),
        "[DONE]",
      ])

    const events = await recolectar(
      streamFromHermes(entrada(), { config: readHermesConfig(ENV_OK), fetch: fetchFalso })
    )
    const texto = events
      .filter((e) => e.type === "text")
      .map((e) => (e as { delta: string }).delta)
      .join("")

    expect(texto).toBe("Buen día, Santiago.")
    expect(events.at(-1)).toEqual({ type: "done" })
  })

  it("manda la identidad en los headers, derivada del usuario autenticado", async () => {
    let capturada: Request | null = null
    const fetchFalso = async (url: string | URL | Request, init?: RequestInit) => {
      capturada = new Request(url as string, init)
      return sseResponse(["[DONE]"])
    }

    await recolectar(
      streamFromHermes(entrada(), { config: readHermesConfig(ENV_OK), fetch: fetchFalso })
    )

    const req = capturada as unknown as Request
    expect(req.headers.get("Authorization")).toBe(`Bearer ${CLAVE}`)
    expect(req.headers.get("X-Hermes-Session-Key")).toBe(sessionKeyForUser(SANTIAGO))
    expect(req.headers.get("X-Hermes-Session-Id")).toBe("conv-1")
  })

  it("las instrucciones viajan como mensaje de sistema, antes que el usuario", async () => {
    let cuerpo: { messages: { role: string; content: string }[] } | null = null
    const fetchFalso = async (_u: unknown, init?: RequestInit) => {
      cuerpo = JSON.parse(String(init?.body))
      return sseResponse(["[DONE]"])
    }

    await recolectar(
      streamFromHermes(entrada(), { config: readHermesConfig(ENV_OK), fetch: fetchFalso })
    )

    const msgs = cuerpo!.messages
    expect(msgs[0].role).toBe("system")
    expect(msgs[0].content).toContain("JARVIS")
    expect(msgs[1].role).toBe("user")
  })
})

describe("fallos", () => {
  it("sin configurar, no intenta conectarse y lo dice", async () => {
    let llamado = false
    const fetchFalso = async () => {
      llamado = true
      return sseResponse([])
    }

    const events = await recolectar(
      streamFromHermes(entrada(), { config: readHermesConfig({}), fetch: fetchFalso })
    )

    expect(llamado).toBe(false)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: "error", code: "unconfigured" })
    expect((events[0] as { message: string }).message).toMatch(/no está conectada/i)
  })

  it("un 401 no filtra el cuerpo del upstream", async () => {
    const fetchFalso = async () =>
      new Response(`API_SERVER_KEY=${CLAVE} inválida en 10.0.0.5`, { status: 401 })

    const events = await recolectar(
      streamFromHermes(entrada(), { config: readHermesConfig(ENV_OK), fetch: fetchFalso })
    )

    const mensaje = (events[0] as { message: string }).message
    expect(events[0].type).toBe("error")
    expect(mensaje).not.toContain(CLAVE)
    expect(mensaje).not.toContain("10.0.0.5")
    expect(mensaje).not.toContain("API_SERVER_KEY")
  })

  it("un 429 se explica como saturación", async () => {
    const fetchFalso = async () => new Response("slow down", { status: 429 })
    const events = await recolectar(
      streamFromHermes(entrada(), { config: readHermesConfig(ENV_OK), fetch: fetchFalso })
    )
    expect((events[0] as { message: string }).message).toMatch(/saturad|minuto/i)
  })

  it("una caída de red se reporta como error, no como respuesta vacía", async () => {
    const fetchFalso = async () => {
      throw new TypeError("fetch failed")
    }
    const events = await recolectar(
      streamFromHermes(entrada(), { config: readHermesConfig(ENV_OK), fetch: fetchFalso })
    )
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: "error", code: "network" })
  })

  it("un stream que se corta a la mitad avisa en lugar de fingir que terminó", async () => {
    const fetchFalso = async () =>
      sseResponse([
        JSON.stringify({ choices: [{ delta: { content: "Estaba diciendo" } }] }),
        // sin [DONE]: el upstream cerró antes de tiempo
      ])

    const events = await recolectar(
      streamFromHermes(entrada(), { config: readHermesConfig(ENV_OK), fetch: fetchFalso })
    )

    expect(events.some((e) => e.type === "text")).toBe(true)
    expect(events.at(-1)).toMatchObject({ type: "error", code: "truncated" })
  })

  it("una respuesta sin cuerpo no rompe el iterador", async () => {
    const fetchFalso = async () => new Response(null, { status: 200 })
    const events = await recolectar(
      streamFromHermes(entrada(), { config: readHermesConfig(ENV_OK), fetch: fetchFalso })
    )
    expect(events.at(-1)?.type).toBe("error")
  })

  it("ningún evento contiene nunca la credencial", async () => {
    const casos = [
      async () => new Response("boom", { status: 500 }),
      async () => new Response("nope", { status: 403 }),
      async () => {
        throw new Error(`falló con ${CLAVE}`)
      },
    ]

    for (const fetchFalso of casos) {
      const events = await recolectar(
        streamFromHermes(entrada(), {
          config: readHermesConfig(ENV_OK),
          fetch: fetchFalso,
        })
      )
      expect(JSON.stringify(events)).not.toContain(CLAVE)
    }
  })
})
