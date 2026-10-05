import { beforeEach, describe, expect, it, vi } from "vitest"
import { recordReservasMilestone } from "./actions"

const mocks = vi.hoisted(() => ({ requireMember: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }))
vi.mock("@/lib/auth", () => ({ requireMember: mocks.requireMember, authorizationMessage: () => "No autorizado" }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))

beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({ data: { ok: true }, error: null })
  mocks.requireMember.mockReset().mockResolvedValue({ supabase: { rpc: mocks.rpc } })
  mocks.revalidate.mockReset()
})
function form(type = "meeting_scheduled") {
  const f = new FormData()
  f.set("prospect_id", "a0000000-0000-0000-0000-000000000001")
  f.set("event_id", "a0000000-0000-0000-0000-000000000002")
  f.set("event_type", type)
  f.set("occurred_at", "2026-10-01T17:30")
  f.set("scheduled_for", "2026-10-02T17:30")
  return f
}
describe("Manual Reservas milestones", () => {
  it("authorizes the user before writing", async () => {
    mocks.requireMember.mockRejectedValue(new Error("not a member"))
    expect(await recordReservasMilestone(form())).toEqual({ error: "No autorizado" })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("converts confirmed Argentina dates and delegates the actor to SQL", async () => {
    expect(await recordReservasMilestone(form())).toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledWith("record_reservas_event", {
      p_payload: { prospect_id: "a0000000-0000-0000-0000-000000000001", event_id: "a0000000-0000-0000-0000-000000000002",
        event_type: "meeting_scheduled", occurred_at: "2026-10-01T20:30:00.000Z",
        details: { scheduled_for: "2026-10-02T20:30:00.000Z", timezone: "America/Argentina/Buenos_Aires" } },
    })
  })
  it("requires a reason to clear suppression and rejects invalid local dates", async () => {
    expect(await recordReservasMilestone(form("unsuppressed"))).toHaveProperty("error")
    const invalid = form()
    invalid.set("occurred_at", "2026-02-31T20:00")
    expect(await recordReservasMilestone(invalid)).toHaveProperty("error")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("reports a rejected write and only refreshes successful writes", async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: false }, error: null })
    expect(await recordReservasMilestone(form())).toHaveProperty("error")
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
})
