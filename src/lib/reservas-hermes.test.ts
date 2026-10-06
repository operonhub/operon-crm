import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { issueSalesToolToken, parseSalesDecision, salesHermesConfig, salesSession, verifySalesToolToken, withoutMediaUrls } from "./reservas-hermes"

describe("Hermes sales boundary", () => {
  it("requires the explicit sales profile and protects its key in transport", () => {
    expect(salesHermesConfig({ HERMES_API_URL: "https://general.example", HERMES_API_KEY: "general-profile-secret" })).toBeNull()
    expect(salesHermesConfig({ RESERVAS_HERMES_API_URL: "http://untrusted.example", RESERVAS_HERMES_API_KEY: "sales-profile-secret" })).toBeNull()
    expect(salesHermesConfig({ RESERVAS_HERMES_API_URL: "https://sales.example/p/ventas", RESERVAS_HERMES_API_KEY: "sales-profile-secret" })?.baseUrl).toBe("https://sales.example/p/ventas")
  })
  it("expires scoped tool access and rejects tampering, another secret and malformed signatures", () => {
    const run = randomUUID(), lease = randomUUID(), now = Date.now()
    const token = issueSalesToolToken("fixture-secret", run, lease, now)
    expect(verifySalesToolToken("fixture-secret", token, now)).toEqual({ runId: run, leaseId: lease })
    expect(verifySalesToolToken("fixture-secret", token, now + 180000)).toBeNull()
    expect(verifySalesToolToken("another-secret", token, now)).toBeNull()
    expect(verifySalesToolToken("fixture-secret", token.replace(run, randomUUID()), now)).toBeNull()
    expect(verifySalesToolToken("fixture-secret", token + "00", now)).toBeNull()
    expect(salesSession(run)).not.toBe(salesSession(randomUUID()))
  })
  it("accepts only the agreed result shape and an evidenced 15–20 minute meeting", () => {
    const result = { intent: "question", action: "draft_message", reason: "Fixture", confidence: .8, draft: "Fixture" }
    expect(parseSalesDecision(JSON.stringify(result))).toEqual(result)
    expect(parseSalesDecision({ ...result, confidence: NaN })).toBeNull()
    expect(parseSalesDecision("Respuesta sin contrato")).toBeNull()
    expect(parseSalesDecision({ ...result, action: "send_whatsapp" })).toBeNull()
    expect(parseSalesDecision({ ...result, draft: "" })).toBeNull()
    const meeting = { ...result, intent: "meeting", action: "book_meeting", meeting: { start: "2027-01-01T10:00:00-03:00", end: "2027-01-01T10:20:00-03:00", evidence_message_id: randomUUID() } }
    expect(parseSalesDecision(meeting)).not.toBeNull()
    expect(parseSalesDecision({ ...meeting, meeting: { ...meeting.meeting, end: "2027-01-01T11:00:00-03:00" } })).toBeNull()
  })
  it("omits signed audio URLs from the conversational context", () => {
    const c = withoutMediaUrls({ messages: [{ id: randomUUID(), attachments: [{ type: "audio", url: "https://media.example/private?signature=fixture" }] }] })
    expect(JSON.stringify(c)).not.toContain("signature")
    expect(c.messages[0].has_audio).toBe(true)
  })
})
