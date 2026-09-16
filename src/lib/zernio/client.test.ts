import { describe, expect, it, vi } from "vitest"
import { listAccounts, parseRetryAfter, zernioRequest, type ZernioDeps } from "./client"
import { readZernioConfig } from "./config"

const CLAVE = `sk_${"a".repeat(64)}`
const CONFIG_OK = readZernioConfig({ ZERNIO_API_KEY: CLAVE })
const SIN_CONFIG = readZernioConfig({})

const CUENTA = {
  _id: "acc_1",
  platform: "instagram",
  username: "operonhub",
  isActive: true,
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })
}

function deps(fetchImpl: typeof fetch, config = CONFIG_OK): ZernioDeps {
  return { config, fetch: fetchImpl }
}

describe("zernioRequest", () => {
  it("sin configuración no intenta la conexión", async () => {
    const llamar = vi.fn()
    const res = await zernioRequest("/accounts", {}, deps(llamar as never, SIN_CONFIG))

    expect(llamar).not.toHaveBeenCalled()
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe("unconfigured")
  })

  it("manda la clave como Bearer y pide JSON", async () => {
    const llamar = vi.fn(async () => json({ data: [] }))
    await zernioRequest("/accounts", {}, deps(llamar as never))

    const [, init] = llamar.mock.calls[0] as unknown as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe(`Bearer ${CLAVE}`)
    expect(headers.Accept).toBe("application/json")
  })

  it("arma la URL con la base y descarta los parámetros vacíos", async () => {
    const llamar = vi.fn(async () => json({ data: [] }))
    await zernioRequest(
      "/accounts",
      { query: { profileId: null, limit: 100, search: "" } },
      deps(llamar as never)
    )

    const [url] = llamar.mock.calls[0] as unknown as [string]
    expect(url).toBe("https://zernio.com/api/v1/accounts?limit=100")
  })

  it("agrega Idempotency-Key cuando se pide", async () => {
    const llamar = vi.fn(async () => json({ ok: true }))
    await zernioRequest(
      "/inbox/conversations/c1/messages",
      { method: "POST", body: { message: "hola" }, idempotencyKey: "abc" },
      deps(llamar as never)
    )

    const [, init] = llamar.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("abc")
    expect(init.body).toBe(JSON.stringify({ message: "hola" }))
  })

  it("traduce el 401 sin filtrar el cuerpo del error", async () => {
    const llamar = vi.fn(async () =>
      json({ error: "invalid key sk_secreta_de_verdad" }, 401)
    )
    const res = await zernioRequest("/accounts", {}, deps(llamar as never))

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.code).toBe("unauthorized")
      expect(res.message).not.toContain("sk_secreta_de_verdad")
      expect(res.message).toContain("ZERNIO_API_KEY")
    }
  })

  it("el 403 explica que es el plan y no la clave", async () => {
    const llamar = vi.fn(async () => json({ code: "feature_not_available" }, 403))
    const res = await zernioRequest("/inbox/conversations", {}, deps(llamar as never))

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe("forbidden")
  })

  it("en el 429 devuelve cuánto hay que esperar", async () => {
    const llamar = vi.fn(async () => json({}, 429, { "Retry-After": "30" }))
    const res = await zernioRequest("/accounts", {}, deps(llamar as never))

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.code).toBe("rate_limited")
      expect(res.retryAfterSeconds).toBe(30)
    }
  })

  it("una respuesta que no es JSON no rompe: se reporta como formato inesperado", async () => {
    const llamar = vi.fn(async () => new Response("<html>502</html>", { status: 200 }))
    const res = await zernioRequest("/accounts", {}, deps(llamar as never))

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe("malformed")
  })

  it("la red caída se reporta como red, no como error de Zernio", async () => {
    const llamar = vi.fn(async () => {
      throw new TypeError("fetch failed")
    })
    const res = await zernioRequest("/accounts", {}, deps(llamar as never))

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe("network")
  })

  it("el corte por timeout se distingue de la red caída", async () => {
    const llamar = vi.fn(async () => {
      const error = new Error("abortado")
      error.name = "AbortError"
      throw error
    })
    const res = await zernioRequest("/accounts", {}, deps(llamar as never))

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe("timeout")
  })
})

describe("parseRetryAfter", () => {
  it("lee los segundos", () => {
    expect(parseRetryAfter("12")).toBe(12)
  })

  it("ignora una fecha HTTP o un valor sin sentido", () => {
    expect(parseRetryAfter("Wed, 21 Oct 2026 07:28:00 GMT")).toBeUndefined()
    expect(parseRetryAfter("-5")).toBeUndefined()
    expect(parseRetryAfter(null)).toBeUndefined()
  })

  it("acota una espera absurda a una hora", () => {
    expect(parseRetryAfter("999999")).toBe(3600)
  })
})

describe("listAccounts", () => {
  it("devuelve las cuentas normalizadas", async () => {
    const llamar = vi.fn(async () => json({ data: [CUENTA] }))
    const res = await listAccounts(deps(llamar as never))

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.accounts).toHaveLength(1)
      expect(res.data.accounts[0].platform).toBe("instagram")
      expect(res.data.accounts[0].zernioAccountId).toBe("acc_1")
    }
  })

  it("cero cuentas conectadas es un éxito con lista vacía, no un error", async () => {
    // Respuesta textual de la API el 2026-09-15, sin nada conectado.
    const llamar = vi.fn(async () => json({ accounts: [], hasAnalyticsAccess: true }))
    const res = await listAccounts(deps(llamar as never))

    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data.accounts).toEqual([])
  })

  it("informa si el add-on de analíticas está contratado", async () => {
    const llamar = vi.fn(async () => json({ accounts: [CUENTA], hasAnalyticsAccess: true }))
    const res = await listAccounts(deps(llamar as never))

    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data.hasAnalyticsAccess).toBe(true)
  })

  it("deja el add-on en null cuando la respuesta no lo informa", async () => {
    const llamar = vi.fn(async () => json({ accounts: [] }))
    const res = await listAccounts(deps(llamar as never))

    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data.hasAnalyticsAccess).toBeNull()
  })

  it("un sobre desconocido es error de formato, no 'no hay cuentas'", async () => {
    const llamar = vi.fn(async () => json({ resultado: "ok" }))
    const res = await listAccounts(deps(llamar as never))

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe("malformed")
  })

  it("filtra por profile cuando está configurado", async () => {
    const llamar = vi.fn(async () => json({ data: [] }))
    const config = readZernioConfig({
      ZERNIO_API_KEY: CLAVE,
      ZERNIO_PROFILE_ID: "prof_1",
    })
    await listAccounts(deps(llamar as never, config))

    const [url] = llamar.mock.calls[0] as unknown as [string]
    expect(url).toContain("profileId=prof_1")
  })
})
