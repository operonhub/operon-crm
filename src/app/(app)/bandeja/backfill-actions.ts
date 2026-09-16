"use server"

import { revalidatePath } from "next/cache"
import type { ActionResult } from "@/lib/action-result"
import type { Json } from "@/lib/supabase/types"
import { writeAudit } from "@/lib/audit"
import { authorizationMessage, requireAdmin } from "@/lib/auth"
import { listConversations, listMessages } from "@/lib/zernio/client"
import { readZernioConfig, readZernioWebhookConfig } from "@/lib/zernio/config"

/**
 * Trae al CRM las conversaciones que ya existían antes de conectar la cuenta.
 *
 * Hace falta porque **el historial previo no dispara webhooks**: Zernio replica
 * los DMs que Meta ya tenía, los guarda como leídos y no emite ni
 * `conversation.started` ni `message.received`. Sin esta importación, la Bandeja
 * sólo mostraría lo que llegue de acá en adelante, aunque en el panel de Zernio
 * se vean cincuenta chats.
 *
 * No escribe en las tablas directamente: reusa el mismo RPC que el webhook.
 * `social_conversations` no tiene política de INSERT a propósito —un hilo existe
 * porque alguien escribió, no porque alguien apretó un botón— y aflojar eso para
 * la importación abriría el camino para fabricar conversaciones desde la app.
 * El RPC es SECURITY DEFINER y ya sabe hacer el trabajo de forma idempotente.
 */

/**
 * Los ids de evento se inventan a partir del id del mensaje, con prefijo propio.
 * Como `social_webhook_events.zernio_event_id` es único, importar dos veces no
 * duplica nada, y el prefijo evita chocar con un evento real de Zernio.
 */
function backfillEventId(messageId: string | null, conversationId: string): string {
  return `backfill:${messageId ?? `conv:${conversationId}`}`
}

/**
 * Presupuesto de pedidos por corrida.
 *
 * El plan de Zernio permite 60 por minuto y cada conversación cuesta uno
 * (traer sus mensajes), más uno por cuenta para listar. Se deja margen.
 *
 * Se reparte **en partes iguales entre las cuentas**, no por orden de llegada:
 * con un tope global, una cuenta con cientos de conversaciones se lo consume
 * entero y la otra no se importa nunca. Con 100+ chats de WhatsApp, Instagram
 * quedaba esperando su turno indefinidamente.
 */
const PRESUPUESTO_POR_CORRIDA = 45
const MENSAJES_POR_CONVERSACION = 50

export async function backfillSocialInbox(): Promise<
  ActionResult<{ conversaciones: number; mensajes: number; pendientes: number }>
> {
  let supabase
  let profileId: string

  try {
    const admin = await requireAdmin()
    supabase = admin.supabase
    profileId = admin.profile.id
  } catch (error) {
    return { error: authorizationMessage(error) }
  }

  const config = readZernioConfig()
  if (!config.configured) return { error: config.reason }

  // El RPC revalida el secreto contra la base, así que la importación necesita
  // el mismo que usa el webhook.
  const webhook = readZernioWebhookConfig()
  if (!webhook.configured) return { error: webhook.reason }

  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("id, zernio_account_id, platform")
    .eq("is_active", true)

  if (!accounts || accounts.length === 0) {
    return {
      error:
        "No hay cuentas sincronizadas. Tocá «Sincronizar cuentas» en Conexiones antes de importar.",
    }
  }

  // Las conversaciones ya importadas se saltean: así una corrida cortada por
  // límite de pedidos continúa donde quedó en vez de empezar de cero.
  const { data: existentes } = await supabase
    .from("social_conversations")
    .select("zernio_conversation_id")
  const yaEstan = new Set((existentes ?? []).map((row) => row.zernio_conversation_id))

  let conversaciones = 0
  let mensajes = 0
  let pendientes = 0
  let cortadoPorLimite = false
  /** Cuántas se importaron de cada plataforma, para poder reportarlo. */
  const porPlataforma: Record<string, number> = {}

  const cupoPorCuenta = Math.max(5, Math.floor(PRESUPUESTO_POR_CORRIDA / accounts.length))

  for (const account of accounts) {
    const lista = await listConversations(
      { config },
      { accountId: account.zernio_account_id, limit: 100 }
    )

    if (!lista.ok) {
      if (lista.code === "rate_limited") cortadoPorLimite = true
      // No se corta el recorrido: la cuenta que sigue puede andar, y si el
      // límite es global igual va a fallar rápido sin gastar nada.
      continue
    }

    const nuevas = lista.data.conversations.filter((c) => !yaEstan.has(c.externalId))
    pendientes += Math.max(0, nuevas.length - cupoPorCuenta)
    let cupoRestante = cupoPorCuenta

    for (const conversation of nuevas) {
      if (cupoRestante <= 0) break
      cupoRestante -= 1
      const hilo = await listMessages(
        { config },
        {
          conversationId: conversation.externalId,
          accountId: account.zernio_account_id,
          limit: MENSAJES_POR_CONVERSACION,
        }
      )

      if (!hilo.ok) {
        if (hilo.code === "rate_limited") {
          cortadoPorLimite = true
          break
        }
        continue
      }


      // Del más viejo al más nuevo, para que los contadores y el último mensaje
      // de la conversación queden como si hubieran llegado en orden.
      const ordenados = [...hilo.data.messages].sort((a, b) =>
        a.sentAt.localeCompare(b.sentAt)
      )

      if (ordenados.length === 0) {
        await supabase.rpc("ingest_social_event", {
          p_secret: webhook.secret,
          p_event_id: backfillEventId(null, conversation.externalId),
          p_event_type: "backfill.conversation",
          p_payload: { origen: "backfill" },
          p_account_external_id: account.zernio_account_id,
          p_conversation: { ...conversation, platform: account.platform } as Json,
          p_message: null,
        })
      }

      for (const message of ordenados) {
        const { error } = await supabase.rpc("ingest_social_event", {
          p_secret: webhook.secret,
          p_event_id: backfillEventId(message.externalId, conversation.externalId),
          p_event_type: "backfill.message",
          p_payload: { origen: "backfill" },
          p_account_external_id: account.zernio_account_id,
          p_conversation: { ...conversation, platform: account.platform } as Json,
          // `attachments` es `unknown[]`: su forma la define cada plataforma y
          // no vale la pena tiparla acá, sólo viaja hasta la columna jsonb.
          p_message: message as unknown as Json,
        })
        if (!error) mensajes += 1
      }

      /**
       * El historial replicado está leído del lado de Zernio, así que importarlo
       * no puede dejar la Bandeja con cincuenta chats en negrita. El RPC suma al
       * contador por cada entrante —correcto para un mensaje que llega ahora—,
       * y acá se corrige de una sola vez para lo que es historia vieja.
       */
      await supabase
        .from("social_conversations")
        .update({ unread_count: 0, last_read_at: new Date().toISOString() })
        .eq("zernio_conversation_id", conversation.externalId)

      conversaciones += 1
      porPlataforma[account.platform] = (porPlataforma[account.platform] ?? 0) + 1
      yaEstan.add(conversation.externalId)
    }
  }

  await writeAudit(supabase, profileId, "social_conversation", null, "backfilled", {
    conversaciones,
    mensajes,
  })

  revalidatePath("/bandeja")

  if (conversaciones === 0 && mensajes === 0) {
    return {
      ok: true,
      data: { conversaciones, mensajes, pendientes },
      message: cortadoPorLimite
        ? "Zernio pidió esperar por límite de pedidos. Probá de nuevo en un minuto."
        : "No había conversaciones nuevas para importar.",
    }
  }

  const desglose = Object.entries(porPlataforma)
    .map(([plataforma, cantidad]) => `${cantidad} de ${plataforma}`)
    .join(" y ")
  const restantes = pendientes + (cortadoPorLimite ? 1 : 0)

  return {
    ok: true,
    data: { conversaciones, mensajes, pendientes },
    message:
      `${desglose || conversaciones} · ${mensajes} mensajes` +
      (restantes > 0 ? ". Quedan más: volvé a tocar en un minuto." : "."),
  }
}
