import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function authenticatedSecret(request: NextRequest): string | null {
  const secret = process.env.N8N_INGEST_SECRET
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1]?.trim()
  return secret && token === secret ? token : null
}

function ingestClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )
}

/** Consulta previa obligatoria para el sender de n8n. Si falla, no se envía. */
export async function GET(request: NextRequest) {
  if (!process.env.N8N_INGEST_SECRET) {
    return NextResponse.json({ ok: false, error: "endpoint no configurado" }, { status: 503 })
  }
  const token = authenticatedSecret(request)
  if (!token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  const prospectId = request.nextUrl.searchParams.get("prospect_id")
  if (!prospectId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(prospectId)) {
    return NextResponse.json({ ok: false, error: "invalid_prospect_id" }, { status: 400 })
  }
  const { data, error } = await ingestClient().rpc("get_reservas_contact_state", {
    p_secret: token, p_prospect_id: prospectId,
  })
  if (error) return NextResponse.json({ ok: false, error: "database_error" }, { status: 500 })
  const result = data as { ok?: boolean }
  return NextResponse.json(result, { status: result.ok ? 200 : 404 })
}

/** Contrato privado para n8n. El secreto también se valida dentro del RPC. */
export async function POST(request: NextRequest) {
  const secret = process.env.N8N_INGEST_SECRET
  if (!secret) {
    return NextResponse.json({ ok: false, error: "endpoint no configurado" }, { status: 503 })
  }
  const token = authenticatedSecret(request)
  if (!token) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  const raw = await request.text()
  if (raw.length > 16_384) {
    return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 })
  }
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 })
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 })
  }
  const payload = body as Record<string, unknown>
  if (payload.kind !== "prospect" && payload.kind !== "event") {
    return NextResponse.json({ ok: false, error: "invalid_kind" }, { status: 400 })
  }

  const { data, error } = await ingestClient().rpc(
    payload.kind === "prospect" ? "ingest_reservas_prospect" : "ingest_reservas_event",
    { p_secret: token, p_payload: payload }
  )
  if (error) return NextResponse.json({ ok: false, error: "database_error" }, { status: 500 })
  const result = data as { ok?: boolean; error?: string }
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
