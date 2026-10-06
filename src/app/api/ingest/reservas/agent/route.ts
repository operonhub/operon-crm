import { timingSafeEqual } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { issueSalesToolToken, parseSalesDecision, salesHermesConfig, salesSession, SALES_OUTPUT_CONTRACT, UUID, withoutMediaUrls } from "@/lib/reservas-hermes"

export const maxDuration = 120

function secret(request: NextRequest) {
  const expected = process.env.N8N_INGEST_SECRET
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1]?.trim()
  if (!expected || !token) return null
  const a = Buffer.from(expected), b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b) ? token : null
}

async function command(request: NextRequest, payload: unknown) {
  if (!process.env.N8N_INGEST_SECRET) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 })
  const token = secret(request)
  if (!token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 })
  const body = payload as Record<string, unknown>
  if (typeof body.run_id !== "string" || !UUID.test(body.run_id)) {
    return NextResponse.json({ ok: false, error: "invalid_run_id" }, { status: 400 })
  }
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  if (body.action === "hermes" || body.action === "transcribe") {
    const config = salesHermesConfig()
    if (process.env.RESERVAS_AGENT_READY !== "true" || !config) return NextResponse.json({ ok: false, error: "sales_hermes_not_ready" }, { status: 503 })
    let audioEndpoint: URL | null = null
    if (body.action === "transcribe") {
      try {
        audioEndpoint = new URL(process.env.RESERVAS_HERMES_TRANSCRIBE_URL ?? "")
        if (audioEndpoint.protocol !== "https:" || audioEndpoint.origin !== new URL(config.baseUrl).origin || audioEndpoint.username || audioEndpoint.password || audioEndpoint.search || audioEndpoint.hash) audioEndpoint = null
      } catch { /* No verified transcription adapter configured. */ }
      if (!audioEndpoint) return NextResponse.json({ ok: false, error: "transcription_not_configured" }, { status: 503 })
    }
    const { data: context, error } = await client.rpc("reservas_agent_command", { p_secret: token, p_payload: { action: audioEndpoint ? "audio_context" : "model_context", run_id: body.run_id, lease_id: body.lease_id } })
    if (error || !context?.ok) return NextResponse.json({ ok: false, error: context?.error ?? "database_error" }, { status: 409 })
    const session = salesSession(context.prospect.id)
    let endpoint = `${config.baseUrl}/v1/chat/completions`
    let upstreamPayload: unknown
    if (audioEndpoint) {
      const latest = context.messages.at(-1)
      const attachment = latest?.direction === "inbound" && Array.isArray(latest.attachments) ? latest.attachments.find((a: Record<string, unknown>) => ["audio", "voice"].includes(String(a.type ?? a.kind)) || String(a.mimeType ?? a.mime_type ?? "").startsWith("audio/")) : null
      let audioUrl: URL | null = null
      try {
        audioUrl = new URL(attachment?.url ?? attachment?.audio_url ?? attachment?.payload?.url ?? "")
        if (audioUrl.protocol !== "https:" || audioUrl.username || audioUrl.password || (audioUrl.port && audioUrl.port !== "443") || !/(^|\.)(zernio\.com|fbcdn\.net|fbsbx\.com|cdn\.whatsapp\.net)$/.test(audioUrl.hostname)) audioUrl = null
      } catch { /* Unsupported or absent audio. */ }
      if (!audioUrl) return NextResponse.json({ ok: false, error: "unsupported_audio_source" }, { status: 400 })
      endpoint = audioEndpoint.href
      upstreamPayload = { run_id: body.run_id, message_id: latest.id, audio_url: audioUrl.href }
    } else {
      upstreamPayload = { stream: false, messages: [{ role: "user", content: JSON.stringify({
        kind: "operon_reservas_turn", run_id: body.run_id, context: withoutMediaUrls(context),
        current_time: new Date().toISOString(), timezone: "America/Argentina/Buenos_Aires",
        output_contract: SALES_OUTPUT_CONTRACT,
        crm_tools: { url: `${request.nextUrl.origin}/api/ingest/reservas/agent/tools`,
          authorization: `Bearer ${issueSalesToolToken(token, context.run_id, context.lease_id)}`,
          actions: ["context", "knowledge", "availability"], expires_in_seconds: 180 },
      }) }] }
    }
    try {
      const response = await fetch(endpoint, { method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(90000),
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "X-Hermes-Session-Id": session, "X-Hermes-Session-Key": session, "Idempotency-Key": `${body.action}:${body.run_id}` }, body: JSON.stringify(upstreamPayload) })
      if (!response.ok) return NextResponse.json({ ok: false, error: response.status === 401 ? "hermes_auth_failed" : "hermes_unavailable" }, { status: 502 })
      const raw = await response.text()
      if (Buffer.byteLength(raw, "utf8") > 1_000_000) return NextResponse.json({ ok: false, error: "hermes_response_too_large" }, { status: 502 })
      const value = JSON.parse(raw)
      if (audioEndpoint) {
        const transcript = typeof value.transcript === "string" ? value.transcript.trim() : ""
        return NextResponse.json(transcript && transcript.length <= 10000 ? { ok: true, transcript } : { ok: false, error: "invalid_transcript" }, { status: transcript && transcript.length <= 10000 ? 200 : 502, headers: { "Cache-Control": "no-store" } })
      }
      const result = parseSalesDecision(value.choices?.[0]?.message?.content)
      return NextResponse.json(result ? { ok: true, result } : { ok: false, error: "invalid_model_result" }, { status: result ? 200 : 502, headers: { "Cache-Control": "no-store" } })
    } catch { return NextResponse.json({ ok: false, error: "hermes_request_failed" }, { status: 502 }) }
  }
  const { data, error } = await client.rpc("reservas_agent_command", { p_secret: token, p_payload: body })
  if (error) return NextResponse.json({ ok: false, error: "database_error" }, { status: 500 })
  return NextResponse.json(body.action === "context" && data?.ok ? withoutMediaUrls(data) : data, { status: data?.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } })
}

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action") ?? "context"
  if (action === "poll") {
    const token = secret(request)
    if (!token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { data, error } = await client.rpc("poll_reservas_agent", { p_secret: token })
    return NextResponse.json(error ? { ok: false, error: "database_error" } : data, { status: error ? 500 : 200, headers: { "Cache-Control": "no-store" } })
  }
  if (!["context", "knowledge", "state", "availability"].includes(action)) return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 })
  return command(request, { action, run_id: request.nextUrl.searchParams.get("run_id"),
    from: request.nextUrl.searchParams.get("from"), to: request.nextUrl.searchParams.get("to") })
}

export async function POST(request: NextRequest) {
  if (!secret(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  const raw = await request.text()
  if (Buffer.byteLength(raw, "utf8") > 16384) return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 })
  let payload: unknown
  try { payload = JSON.parse(raw) } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }) }
  return command(request, payload)
}
