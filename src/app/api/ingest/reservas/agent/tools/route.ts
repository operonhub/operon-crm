import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { verifySalesToolToken, withoutMediaUrls } from "@/lib/reservas-hermes"

// Read-only, short-lived capability for precisely one agent run and lease.
export async function GET(request: NextRequest) {
  const secret = process.env.N8N_INGEST_SECRET
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1] ?? ""
  const scope = secret ? verifySalesToolToken(secret, token) : null
  if (!scope || !secret) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  const action = request.nextUrl.searchParams.get("action") ?? "context"
  if (!["context", "knowledge", "availability"].includes(action)) return NextResponse.json({ ok: false, error: "read_only" }, { status: 400 })
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const { data: context, error } = await client.rpc("reservas_agent_command", { p_secret: secret, p_payload: { action: "tool_context", run_id: scope.runId, lease_id: scope.leaseId } })
  if (error || !context?.ok) return NextResponse.json({ ok: false, error: "scope_unavailable" }, { status: 409 })
  let result = action === "knowledge" ? { ok: true, knowledge: context.knowledge } : withoutMediaUrls(context)
  if (action === "availability") {
    const { data, error: availabilityError } = await client.rpc("reservas_agent_command", { p_secret: secret, p_payload: { action, run_id: scope.runId, from: request.nextUrl.searchParams.get("from"), to: request.nextUrl.searchParams.get("to") } })
    if (availabilityError || !data?.ok) return NextResponse.json({ ok: false, error: data?.error ?? "calendar_unavailable" }, { status: 400 })
    result = data
  }
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } })
}
