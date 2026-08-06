import { describe, it, expect } from "vitest"
import { parseCSV, normalizeHeader } from "./csv"

describe("parseCSV", () => {
  it("parsea filas y columnas básicas", () => {
    const rows = parseCSV("empresa,web\nAcme,acme.com\nGlobex,globex.com")
    expect(rows).toEqual([
      ["empresa", "web"],
      ["Acme", "acme.com"],
      ["Globex", "globex.com"],
    ])
  })

  it("respeta comas dentro de comillas", () => {
    const rows = parseCSV('empresa,notas\n"Acme, SA","hola, mundo"')
    expect(rows[1]).toEqual(["Acme, SA", "hola, mundo"])
  })

  it("soporta comillas escapadas", () => {
    const rows = parseCSV('a\n"dijo ""hola"""')
    expect(rows[1][0]).toBe('dijo "hola"')
  })

  it("ignora filas totalmente vacías", () => {
    const rows = parseCSV("empresa\nAcme\n\n\nGlobex\n")
    expect(rows).toEqual([["empresa"], ["Acme"], ["Globex"]])
  })

  it("maneja CRLF", () => {
    const rows = parseCSV("a,b\r\n1,2\r\n")
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ])
  })
})

describe("normalizeHeader", () => {
  it("mapea sinónimos y acentos a claves canónicas", () => {
    expect(normalizeHeader("Organización")).toBe("empresa")
    expect(normalizeHeader("Sitio")).toBe("web")
    expect(normalizeHeader("Teléfono")).toBe("telefono")
    expect(normalizeHeader("correo")).toBe("email")
    expect(normalizeHeader("Origen")).toBe("fuente")
  })

  it("deja pasar claves ya canónicas", () => {
    expect(normalizeHeader("empresa")).toBe("empresa")
    expect(normalizeHeader("segmento")).toBe("segmento")
  })
})
