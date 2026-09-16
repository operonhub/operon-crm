import { describe, expect, it } from "vitest"
import {
  DEFAULT_ZERNIO_BASE_URL,
  maskApiKey,
  readZernioConfig,
  readZernioWebhookConfig,
} from "./config"

const CLAVE = `sk_${"a".repeat(64)}`
const SECRETO = "secreto-de-webhook-bien-largo-para-firmar"

describe("readZernioConfig", () => {
  it("sin variables, dice honestamente que no está configurada", () => {
    const cfg = readZernioConfig({})
    expect(cfg.configured).toBe(false)
    if (!cfg.configured) expect(cfg.reason).toContain("ZERNIO_API_KEY")
  })

  it("rechaza una clave que no tiene el prefijo de Zernio", () => {
    // El error más común: pegar la anon key de Supabase o el secreto del webhook.
    const cfg = readZernioConfig({ ZERNIO_API_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6" })
    expect(cfg.configured).toBe(false)
    if (!cfg.configured) expect(cfg.reason).toContain("sk_")
  })

  it("rechaza una clave con el prefijo correcto pero demasiado corta", () => {
    const cfg = readZernioConfig({ ZERNIO_API_KEY: "sk_corta" })
    expect(cfg.configured).toBe(false)
  })

  it("con la clave completa queda configurada y usa la base documentada", () => {
    const cfg = readZernioConfig({ ZERNIO_API_KEY: CLAVE })
    expect(cfg.configured).toBe(true)
    if (cfg.configured) {
      expect(cfg.baseUrl).toBe(DEFAULT_ZERNIO_BASE_URL)
      expect(cfg.profileId).toBeNull()
    }
  })

  it("le saca la barra final a la base para no generar URLs con doble barra", () => {
    const cfg = readZernioConfig({
      ZERNIO_API_KEY: CLAVE,
      ZERNIO_API_URL: "https://zernio.test/api/v1///",
    })
    expect(cfg.configured).toBe(true)
    if (cfg.configured) expect(cfg.baseUrl).toBe("https://zernio.test/api/v1")
  })

  it("toma el profile cuando está definido", () => {
    const cfg = readZernioConfig({ ZERNIO_API_KEY: CLAVE, ZERNIO_PROFILE_ID: " prof_1 " })
    expect(cfg.configured).toBe(true)
    if (cfg.configured) expect(cfg.profileId).toBe("prof_1")
  })

  it("ignora un profile vacío en vez de mandar un filtro en blanco", () => {
    const cfg = readZernioConfig({ ZERNIO_API_KEY: CLAVE, ZERNIO_PROFILE_ID: "   " })
    expect(cfg.configured).toBe(true)
    if (cfg.configured) expect(cfg.profileId).toBeNull()
  })

  it("no lee la clave desde una variable pública del navegador", () => {
    const cfg = readZernioConfig({ NEXT_PUBLIC_ZERNIO_API_KEY: CLAVE })
    expect(cfg.configured).toBe(false)
  })
})

describe("readZernioWebhookConfig", () => {
  it("sin secreto, no está configurado", () => {
    expect(readZernioWebhookConfig({}).configured).toBe(false)
  })

  it("rechaza un secreto corto: firmar con eso no protege nada", () => {
    expect(readZernioWebhookConfig({ ZERNIO_WEBHOOK_SECRET: "1234" }).configured).toBe(
      false
    )
  })

  it("acepta un secreto largo", () => {
    const cfg = readZernioWebhookConfig({ ZERNIO_WEBHOOK_SECRET: SECRETO })
    expect(cfg.configured).toBe(true)
    if (cfg.configured) expect(cfg.secret).toBe(SECRETO)
  })
})

describe("maskApiKey", () => {
  it("deja ver las puntas y esconde el resto", () => {
    const masked = maskApiKey(CLAVE)
    expect(masked.startsWith("sk_aaa")).toBe(true)
    expect(masked).toContain("…")
    expect(masked).not.toContain("a".repeat(20))
  })

  it("no revela nada de una clave muy corta", () => {
    expect(maskApiKey("sk_123")).toBe("••••••")
  })
})
