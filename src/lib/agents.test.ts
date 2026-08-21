import { describe, expect, it } from "vitest"
import { deriveAgentMetrics, isAgentTransitionAllowed } from "./agents"

describe("métricas reales de agentes", () => {
  it("deriva ejecuciones, errores y aprobaciones sin inventar actividad", () => {
    const metrics = deriveAgentMetrics(
      [
        { status: "succeeded", started_at: "2026-08-20T10:00:00Z", finished_at: "2026-08-20T10:00:10Z" },
        { status: "failed", started_at: "2026-08-20T11:00:00Z", finished_at: "2026-08-20T11:00:30Z" },
        { status: "running", started_at: "2026-08-20T12:00:00Z", finished_at: null },
      ],
      [{ status: "pending" }, { status: "approved" }]
    )

    expect(metrics).toEqual({
      totalRuns: 3,
      successfulRuns: 1,
      failedRuns: 1,
      pendingApprovals: 1,
      successRate: 50,
      averageDurationSeconds: 20,
    })
  })

  it("devuelve ceros honestos cuando todavía no hay ejecuciones", () => {
    expect(deriveAgentMetrics([], [])).toEqual({
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      pendingApprovals: 0,
      successRate: null,
      averageDurationSeconds: null,
    })
  })
})

describe("estados de agentes", () => {
  it("obliga a pasar por pausa antes de archivar un agente activo", () => {
    expect(isAgentTransitionAllowed("active", "archived")).toBe(false)
    expect(isAgentTransitionAllowed("active", "paused")).toBe(true)
    expect(isAgentTransitionAllowed("paused", "archived")).toBe(true)
    expect(isAgentTransitionAllowed("archived", "active")).toBe(false)
  })
})
