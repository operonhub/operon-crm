import { describe, expect, it } from "vitest"
import {
  normalizeAccount,
  normalizePlatform,
  parseAccountsPayload,
  platformLabel,
} from "./types"

const CUENTA_IG = {
  _id: "acc_ig_1",
  platform: "instagram",
  username: "operonhub",
  displayName: "Operon",
  profileUrl: "https://instagram.com/operonhub",
  profileId: { _id: "prof_1", name: "Operon", slug: "operon" },
  isActive: true,
  followerCount: 1280,
}

describe("normalizePlatform", () => {
  it("reconoce las plataformas que el CRM modela", () => {
    expect(normalizePlatform("whatsapp")).toBe("whatsapp")
    expect(normalizePlatform("INSTAGRAM")).toBe("instagram")
  })

  it("manda a 'other' una plataforma que todavía no modelamos", () => {
    // Zernio soporta 16 y suma más: una nueva no puede romper la sincronización.
    expect(normalizePlatform("pinterest")).toBe("other")
  })

  it("tolera valores que no son texto", () => {
    expect(normalizePlatform(undefined)).toBe("other")
    expect(normalizePlatform(42)).toBe("other")
  })

  it("tiene etiqueta en castellano para todas", () => {
    expect(platformLabel("whatsapp")).toBe("WhatsApp")
    expect(platformLabel("pinterest")).toBe("Otra plataforma")
  })
})

describe("normalizeAccount", () => {
  it("traduce una cuenta de Zernio a la forma del CRM", () => {
    expect(normalizeAccount(CUENTA_IG)).toEqual({
      zernioAccountId: "acc_ig_1",
      zernioProfileId: "prof_1",
      platform: "instagram",
      username: "operonhub",
      displayName: "Operon",
      profileUrl: "https://instagram.com/operonhub",
      avatarUrl: null,
      isActive: true,
      followerCount: 1280,
    })
  })

  it("acepta el profile como string suelto además de como objeto", () => {
    const cuenta = normalizeAccount({ ...CUENTA_IG, profileId: "prof_2" })
    expect(cuenta?.zernioProfileId).toBe("prof_2")
  })

  it("descarta una cuenta sin identificador: no se podría deduplicar", () => {
    expect(normalizeAccount({ platform: "whatsapp", username: "operon" })).toBeNull()
    expect(normalizeAccount(null)).toBeNull()
    expect(normalizeAccount("instagram")).toBeNull()
  })

  it("sólo un false explícito apaga la cuenta", () => {
    expect(normalizeAccount({ _id: "a" })?.isActive).toBe(true)
    expect(normalizeAccount({ _id: "a", isActive: false })?.isActive).toBe(false)
  })

  it("ignora un contador de seguidores imposible", () => {
    expect(normalizeAccount({ _id: "a", followerCount: -5 })?.followerCount).toBeNull()
    expect(normalizeAccount({ _id: "a", followerCount: "muchos" })?.followerCount).toBeNull()
  })

  it("convierte los textos vacíos en null en vez de guardar cadenas en blanco", () => {
    const cuenta = normalizeAccount({ _id: "a", username: "   ", displayName: "" })
    expect(cuenta?.username).toBeNull()
    expect(cuenta?.displayName).toBeNull()
  })
})

describe("parseAccountsPayload", () => {
  it("acepta el sobre REAL de la API: { accounts, hasAnalyticsAccess }", () => {
    // Verificado contra zernio.com el 2026-09-15. La doc decía `data`; la API
    // devuelve `accounts`. Este es el caso que importa de verdad.
    const cuentas = parseAccountsPayload({
      accounts: [CUENTA_IG],
      hasAnalyticsAccess: true,
    })
    expect(cuentas).toHaveLength(1)
    expect(cuentas?.[0].zernioAccountId).toBe("acc_ig_1")
  })

  it("una cuenta cero con el sobre real es lista vacía, no formato desconocido", () => {
    // Es la respuesta exacta que devuelve la API sin cuentas conectadas.
    expect(parseAccountsPayload({ accounts: [], hasAnalyticsAccess: true })).toEqual([])
  })

  it("acepta el sobre { data: [...] } que documenta la referencia", () => {
    expect(parseAccountsPayload({ data: [CUENTA_IG] })).toHaveLength(1)
  })

  it("acepta un array pelado", () => {
    expect(parseAccountsPayload([CUENTA_IG])).toHaveLength(1)
  })

  it("acepta el sobre anidado { data: { accounts: [...] } }", () => {
    expect(parseAccountsPayload({ data: { accounts: [CUENTA_IG] } })).toHaveLength(1)
  })

  it("devuelve lista vacía cuando no hay cuentas conectadas", () => {
    expect(parseAccountsPayload({ data: [] })).toEqual([])
  })

  it("devuelve null cuando el formato es desconocido", () => {
    // Distinguir "formato raro" de "cero cuentas" es lo que evita que la UI
    // diga "no tenés nada conectado" cuando en realidad cambió el contrato.
    expect(parseAccountsPayload({ resultado: "ok" })).toBeNull()
    expect(parseAccountsPayload(null)).toBeNull()
    expect(parseAccountsPayload("cuentas")).toBeNull()
  })

  it("saltea las filas rotas y conserva las buenas", () => {
    const cuentas = parseAccountsPayload({ data: [CUENTA_IG, { sin: "id" }, null] })
    expect(cuentas).toHaveLength(1)
    expect(cuentas?.[0].zernioAccountId).toBe("acc_ig_1")
  })
})
