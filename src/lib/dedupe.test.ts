import { describe, it, expect } from "vitest"
import { normalizeDomain, normalizeEmail, normalizeOrganizationName } from "./dedupe"

describe("normalizeDomain", () => {
  it("quita protocolo, www, path y query", () => {
    expect(normalizeDomain("https://www.doncarlos.com.ar/contacto?x=1")).toBe(
      "doncarlos.com.ar"
    )
  })

  it("normaliza a minúsculas", () => {
    expect(normalizeDomain("HTTP://Andina.COM.ar")).toBe("andina.com.ar")
  })

  it("acepta un dominio pelado", () => {
    expect(normalizeDomain("ferrelopez.com")).toBe("ferrelopez.com")
  })

  it("devuelve null para vacío o nulo", () => {
    expect(normalizeDomain("")).toBeNull()
    expect(normalizeDomain(null)).toBeNull()
    expect(normalizeDomain("   ")).toBeNull()
  })

  it("dos formas del mismo dominio colapsan al mismo valor", () => {
    expect(normalizeDomain("https://www.andina.com.ar")).toBe(
      normalizeDomain("andina.com.ar")
    )
  })
})

describe("normalizeOrganizationName", () => {
  it("ignora mayúsculas y espacios repetidos sin quitar palabras", () => {
    expect(normalizeOrganizationName("  Papelera   Roma ")).toBe("papelera roma")
  })

  it("devuelve null para vacío", () => {
    expect(normalizeOrganizationName("   ")).toBeNull()
  })
})

describe("normalizeEmail", () => {
  it("baja a minúsculas y recorta", () => {
    expect(normalizeEmail("  Marta@Andina.com.AR ")).toBe("marta@andina.com.ar")
  })

  it("devuelve null para vacío", () => {
    expect(normalizeEmail("")).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
  })
})
