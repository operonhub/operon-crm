import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { readZernioWebhookConfig } from "@/lib/zernio/config"
import { normalizeInboxEvent } from "@/lib/zernio/events"
import { readSignatureHeader, verifySignature } from "@/lib/zernio/signature"

/**
 * Webhook del inbox de Zernio: WhatsApp e Instagram entran por acá.
 *
 * Modelado sobre `/api/ingest/leads`, con tres reglas que vienen del contrato
 * de entrega de Zernio y que no son negociables:
 *
 *  1. **Responder 2xx en menos de 5 segundos.** Pasado ese plazo la entrega
 *     cuenta como fallida y el evento se reintenta hasta 7 veces. Por eso acá
 *     sólo se valida, se deduplica y se escribe: ninguna llamada de vuelta a
 *     Zernio, ningún trabajo pesado.
 *  2. **Un evento que no se entiende también se responde 200.** Devolver 4xx o
 *     5xx haría que Zernio reintente siete veces algo que va a fallar igual las
 *     siete. Se anota y se sigue.
 *  3. **Entrega at-least-once**, así que el mismo evento puede llegar repetido.
 *     La deduplicación es el índice único sobre `social_webhook_events`.
 */

// Cliente anónimo (sin sesión, sin genérico para permitir el rpc custom).
// Las escrituras las hace `ingest_social_event`, SECURITY DEFINER, que revalida
// el secreto contra `ingest_config` — una tabla sin políticas de lectura.
function webhookClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )
}

// ---- Rate limit básico en memoria (best-effort, igual que la ingesta) ----
const WINDOW_MS = 60_000
const MAX_REQ = 600
const hits = new Map<string, number[]>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  arr.push(now)
  hits.set(ip, arr)
  return arr.length > MAX_REQ
}

export async function POST(req: NextRequest) {
  const config = readZernioWebhookConfig()
  if (!config.configured) {
    // Sin secreto no se puede verificar nada, y aceptar a ciegas sería peor que
    // rechazar: cualquiera podría inyectar mensajes en la Bandeja.
    return NextResponse.json(
      { ok: false, error: "endpoint no configurado" },
      { status: 503 }
    )
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconocido"
  if (rateLimited(ip)) {
    return NextResponse.json({ ok: false, error: "rate limited" }, { status: 429 })
  }

  // El cuerpo CRUDO, sin parsear: la firma se calcula sobre estos bytes
  // exactos. Un `await req.json()` y después un `JSON.stringify` daría un texto
  // distinto (orden de claves, espacios) y la firma no cerraría nunca.
  const rawBody = await req.text()

  if (!verifySignature(rawBody, readSignatureHeader(req.headers), config.secret)) {
    return NextResponse.json({ ok: false, error: "firma inválida" }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: true, status: "invalid" })
  }

  const event = normalizeInboxEvent(payload)

  if (event.kind === "invalid") {
    // Firmado por Zernio pero sin identidad: no se puede ni anotar sin `id`.
    return NextResponse.json({ ok: true, status: "invalid" })
  }

  try {
    const supabase = webhookClient()

    if (event.kind === "ignored") {
      // Se anota igual. Cuando alguien pregunte "¿por qué no apareció este
      // mensaje?", la respuesta tiene que estar en la base, no en un log perdido.
      await supabase.rpc("ingest_social_event", {
        p_secret: config.secret,
        p_event_id: event.eventId,
        p_event_type: event.eventType,
        p_payload: payload,
        p_account_external_id: null,
        p_conversation: null,
        p_message: null,
      })
      return NextResponse.json({ ok: true, status: "ignored" })
    }

    const { data, error } = await supabase.rpc("ingest_social_event", {
      p_secret: config.secret,
      p_event_id: event.eventId,
      p_event_type: event.eventType,
      p_payload: payload,
      p_account_external_id: event.accountExternalId,
      p_conversation: event.conversation,
      p_message: event.message,
    })

    if (error) {
      // 500 para que Zernio reintente: acá sí tiene sentido, porque el fallo es
      // nuestro (base caída) y el reintento puede salir bien.
      console.error("[zernio] fallo al escribir el evento", { code: error.code })
      return NextResponse.json({ ok: false, error: "error interno" }, { status: 500 })
    }

    const status = (data as { status?: string } | null)?.status ?? "processed"
    if (status === "unauthorized") {
      // La firma cerró pero la base dice que no. Es desajuste de configuración:
      // ZERNIO_WEBHOOK_SECRET y `ingest_config.zernio_webhook_secret` difieren.
      console.error("[zernio] el secreto del entorno no coincide con el de la base")
      return NextResponse.json({ ok: false, error: "no autorizado" }, { status: 401 })
    }

    return NextResponse.json({ ok: true, status })
  } catch (error) {
    console.error("[zernio] excepción procesando el webhook", {
      name: (error as Error)?.name,
    })
    return NextResponse.json({ ok: false, error: "error interno" }, { status: 500 })
  }
}
