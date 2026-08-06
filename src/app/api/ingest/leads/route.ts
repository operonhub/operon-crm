import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Cliente anónimo (sin sesión, sin genérico para permitir el rpc custom).
// Las escrituras las hace la función SECURITY DEFINER `ingest_lead`,
// que valida el secreto internamente.
function ingestClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )
}

// ---- Rate limit básico en memoria (best-effort) ----
const WINDOW_MS = 60_000
const MAX_REQ = 60
const hits = new Map<string, number[]>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  arr.push(now)
  hits.set(ip, arr)
  return arr.length > MAX_REQ
}

function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization")
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim()
  return req.headers.get("x-api-key")?.trim() ?? null
}

export async function POST(req: NextRequest) {
  const secret = process.env.N8N_INGEST_SECRET
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "endpoint no configurado" },
      { status: 503 }
    )
  }

  const token = extractToken(req)
  if (!token || token !== secret) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    )
  }

  const ip = req.headers.get("x-forwarded-for") ?? "unknown"
  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { ok: false, error: "json inválido" },
      { status: 400 }
    )
  }

  const items = Array.isArray(body) ? body : [body]
  if (items.length === 0 || items.length > 100) {
    return NextResponse.json(
      { ok: false, error: "el lote debe tener entre 1 y 100 leads" },
      { status: 400 }
    )
  }

  const supabase = ingestClient()
  const results: unknown[] = []

  for (const item of items) {
    const { data, error } = await supabase.rpc("ingest_lead", {
      p_secret: token,
      p_payload: item,
    })
    if (error) {
      results.push({ ok: false, error: error.message })
    } else {
      results.push(data)
    }
  }

  const created = results.filter(
    (r) => (r as { action?: string })?.action === "created"
  ).length
  const updated = results.filter(
    (r) => (r as { action?: string })?.action === "updated"
  ).length

  return NextResponse.json({ ok: true, created, updated, results })
}
