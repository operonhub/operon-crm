import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import type { ReservasAgentResult } from "./reservas-agent"

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function salesHermesConfig(env: Record<string, string | undefined> = process.env) {
  const baseUrl = env.RESERVAS_HERMES_API_URL?.trim().replace(/\/+$/, "")
  const apiKey = env.RESERVAS_HERMES_API_KEY?.trim()
  if (!baseUrl || !apiKey || apiKey.length < 16) return null
  try {
    const u = new URL(baseUrl)
    if (u.username || u.password || u.search || u.hash || u.protocol !== "https:") return null
  } catch { return null }
  return { baseUrl, apiKey }
}

export function salesSession(prospectId: string) {
  return createHash("sha256").update(`operon-reservas:${prospectId}`).digest("hex").slice(0, 32)
}
export function issueSalesToolToken(secret: string, runId: string, leaseId: string, now = Date.now()) {
  const content = `${runId}.${leaseId}.${Math.floor(now / 1000) + 180}`
  return `${content}.${createHmac("sha256", secret).update(content).digest("hex")}`
}
export function verifySalesToolToken(secret: string, token: string, now = Date.now()) {
  const [runId, leaseId, expiry, signature, extra] = token.split(".")
  const expires = Number(expiry), current = Math.floor(now / 1000)
  if (extra !== undefined || !UUID.test(runId ?? "") || !UUID.test(leaseId ?? "") || !/^\d+$/.test(expiry ?? "") || expires <= current || expires > current + 180 || !/^[a-f0-9]{64}$/.test(signature ?? "")) return null
  const expected = createHmac("sha256", secret).update(`${runId}.${leaseId}.${expiry}`).digest()
  return timingSafeEqual(expected, Buffer.from(signature, "hex")) ? { runId, leaseId } : null
}

export function parseSalesDecision(value: unknown): ReservasAgentResult | null {
  if (typeof value === "string") { try { value = JSON.parse(value) } catch { return null } }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const r = value as Record<string, unknown>
  if (!["interested", "question", "objection", "meeting", "unsubscribe", "unknown"].includes(String(r.intent)) || !["draft_message", "follow_up", "request_human", "no_action", "book_meeting"].includes(String(r.action)) || typeof r.reason !== "string" || !r.reason.trim() || r.reason.length > 2000 || typeof r.draft !== "string" || r.draft.length > 2000 || typeof r.confidence !== "number" || !Number.isFinite(r.confidence) || r.confidence < 0 || r.confidence > 1) return null
  if (["draft_message", "follow_up"].includes(String(r.action)) && !r.draft.trim()) return null
  if (r.action === "book_meeting") {
    const m = r.meeting as Record<string, unknown> | undefined
    if (r.intent !== "meeting" || !m || typeof m.start !== "string" || typeof m.end !== "string" || !UUID.test(String(m.evidence_message_id))) return null
    const start = Date.parse(m.start), end = Date.parse(m.end)
    if (!Number.isFinite(start) || !Number.isFinite(end) || !/(Z|[+-]\d{2}:\d{2})$/.test(m.start) || !/(Z|[+-]\d{2}:\d{2})$/.test(m.end) || end - start < 15 * 60000 || end - start > 20 * 60000) return null
  }
  return { intent: r.intent, action: r.action, reason: r.reason, confidence: r.confidence, draft: r.draft, ...(r.action === "book_meeting" ? { meeting: r.meeting } : {}) } as ReservasAgentResult
}

export function withoutMediaUrls(context: Record<string, unknown>) {
  return { ...context, messages: (Array.isArray(context.messages) ? context.messages : []).map(m => {
    const { attachments, ...message } = m as Record<string, unknown>
    return { ...message, has_audio: Array.isArray(attachments) && attachments.some(a => ["audio", "voice"].includes(a.type ?? a.kind) || String(a.mimeType ?? a.mime_type ?? "").startsWith("audio/")) }
  }) }
}

// Transport contract only. Commercial instructions live in the VPS profile.
export const SALES_OUTPUT_CONTRACT = {
  intent: ["interested", "question", "objection", "meeting", "unsubscribe", "unknown"],
  action: ["draft_message", "follow_up", "request_human", "no_action", "book_meeting"],
  reason: "string, 1..2000 characters", confidence: "number, 0..1", draft: "string, 0..2000 characters",
  meeting: "Only book_meeting: {start: ISO timestamp with timezone, end: ISO timestamp with timezone, evidence_message_id: actual inbound message UUID}",
}
