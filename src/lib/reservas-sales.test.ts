import { describe, expect, it } from "vitest"
import { argentineInputTimestamp, conversion, csvCell, reservasCsv, reservasFunnel, reservasTimestamp, type ReservasMetrics, type ReservasExportRow } from "./reservas-sales"

describe("Reservas metrics and Excel exports", () => {
  it("does not invent a rate when there is no denominator", () => {
    expect(conversion(0, 0)).toBeNull()
    expect(conversion(1, 4)).toBe(25)
  })
  it("uses intersection counts when prospects skip stages", () => {
    const metrics: ReservasMetrics = { imported: 10, contacted: 5, responded: 2, scheduled: 3, held: 2,
      proposed: 2, won: 1, lost: 1, suppressed: 1, scheduled_from_replies: 1, held_from_scheduled: 1,
      proposed_from_held: 0, won_from_proposed: 1, pending: 0, overdue: 0, meeting_soon: 0 }
    const steps = reservasFunnel(metrics)
    expect(steps[3].count).toBe(3)
    expect(conversion(steps[3].numerator!, steps[3].denominator!)).toBe(50)
    expect(steps[5].numerator).toBe(0)
  })
  it("formats timestamps in Argentina even when UTC has crossed midnight", () => {
    expect(reservasTimestamp("2026-10-05T01:30:00Z")).toContain("04/10/2026")
    expect(reservasTimestamp("2026-10-05T01:30:00Z")).toContain("22:30")
    expect(reservasTimestamp(null)).toBe("Sin fecha confirmada")
  })
  it("escapes Excel formulas, separators, quotes and line breaks", () => {
    expect(csvCell("  =1+1")).toBe('"\'  =1+1"')
    expect(csvCell("+5491112345678")).toBe('"\'+5491112345678"')
    expect(csvCell('A; "B"\nC')).toBe('"A; ""B""\nC"')
    expect(csvCell(null)).toBe('""')
    expect(csvCell("@SUM(1;2)")).toBe('"\'@SUM(1;2)"')
  })
  it("interprets form dates in Argentina and rejects silently rolled-over dates", () => {
    expect(argentineInputTimestamp("2026-10-04T23:30")).toBe("2026-10-05T02:30:00.000Z")
    expect(argentineInputTimestamp("2026-02-31T23:30")).toBeNull()
    expect(argentineInputTimestamp("not-a-date")).toBeNull()
  })
  it("keeps separate event/message records and IDs in UTF-8 CSV", () => {
    const row = { id: "p1", lead_id: "l1", events: [
      { id: "e1", source: "crm", source_event_id: "se1", event_type: "won", actor: "crm:actor", occurred_at: "date", recorded_at: "date", details: {} },
      { id: "e2", source: "crm", source_event_id: "se2", event_type: "lost", actor: "crm:actor", occurred_at: "date", recorded_at: "date", details: {} },
    ], messages: [] } as unknown as ReservasExportRow
    const csv = reservasCsv([row], "eventos")
    expect(csv.startsWith("\uFEFFsep=;\r\n")).toBe(true)
    expect(csv).toContain('"p1";"l1";"e1"')
    expect(csv).toContain('"p1";"l1";"e2"')
    expect(reservasCsv([], "mensajes")).toContain('"prospect_id";"lead_id";"mensaje_id"')
  })
})
