import { describe, expect, it } from "vitest"
import { convertUsdToArs, parseDolarApiQuote } from "./exchange-rates"

describe("cotizaciones", () => {
  it("conserva el valor vendedor y normaliza la fecha", () => {
    expect(parseDolarApiQuote("blue", {
      venta: 1_450,
      fechaActualizacion: "2026-09-22T09:00:00-03:00",
    })).toEqual({
      type: "blue",
      sellRate: 1_450,
      quotedAt: "2026-09-22T12:00:00.000Z",
    })
  })

  it("rechaza respuestas sin una cotización utilizable", () => {
    expect(() => parseDolarApiQuote("official", { venta: 0 })).toThrow()
    expect(() => parseDolarApiQuote("official", { venta: "texto" })).toThrow()
  })

  it("convierte USD a ARS sin errores de coma flotante visibles", () => {
    expect(convertUsdToArs(30, 1_425.55)).toBe(42_766.5)
  })
})
