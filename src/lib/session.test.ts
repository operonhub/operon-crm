import { describe, expect, it } from "vitest"
import { sessionUserFromClaims } from "./session"

const SANTIAGO = "11111111-1111-1111-1111-111111111111"

describe("sessionUserFromClaims", () => {
  it("devuelve id y email de una sesión autenticada", () => {
    expect(
      sessionUserFromClaims({ sub: SANTIAGO, role: "authenticated", email: "santi@operon.dev" })
    ).toEqual({ id: SANTIAGO, email: "santi@operon.dev" })
  })

  it("rechaza el token de la clave anon aunque esté bien firmado", () => {
    // La clave anon es pública y también es un JWT válido: no es una persona.
    expect(sessionUserFromClaims({ sub: SANTIAGO, role: "anon" })).toBeNull()
  })

  it("rechaza un sub que no es uuid", () => {
    expect(sessionUserFromClaims({ sub: "admin", role: "authenticated" })).toBeNull()
    expect(sessionUserFromClaims({ role: "authenticated" })).toBeNull()
  })

  it("rechaza claims ausentes o malformados", () => {
    expect(sessionUserFromClaims(null)).toBeNull()
    expect(sessionUserFromClaims(undefined)).toBeNull()
    expect(sessionUserFromClaims("token")).toBeNull()
  })

  it("tolera una sesión sin email (login por teléfono u OAuth sin email)", () => {
    expect(sessionUserFromClaims({ sub: SANTIAGO, role: "authenticated", email: "" })).toEqual({
      id: SANTIAGO,
      email: null,
    })
  })
})
