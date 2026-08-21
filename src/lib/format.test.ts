import { describe, expect, it } from "vitest"
import { formatDateNumeric, parseDate, toISODate } from "./format"

describe("fechas operativas", () => {
  it("formatea fechas ISO sin corrimiento UTC", () => {
    expect(formatDateNumeric("2026-08-20")).toBe("20/08/2026")
    expect(parseDate("2026-08-20")?.getDate()).toBe(20)
  })

  it("normaliza timestamps y conserva estados vacíos", () => {
    expect(toISODate("2026-08-20T23:55:00Z")).toBe("2026-08-20")
    expect(formatDateNumeric(null)).toBe("—")
  })
})
