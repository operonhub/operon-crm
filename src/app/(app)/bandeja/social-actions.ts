"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import type { ActionResult } from "@/lib/action-result"
import { writeAudit } from "@/lib/audit"
import { authorizationMessage, requireMember } from "@/lib/auth"
import type { Enums } from "@/lib/supabase/types"
import { sendMessage } from "@/lib/zernio/client"
import { readZernioConfig } from "@/lib/zernio/config"
import { messagingWindow } from "@/lib/zernio/events"

/**
 * Acciones de la Bandeja externa (WhatsApp e Instagram).
 *
 * Separadas de `actions.ts`, que maneja la Bandeja interna del equipo: son dos
 * dominios distintos —uno habla con Zernio, el otro no sale del CRM— y mezclarlos
 * haría que cada archivo necesite la mitad del contexto del otro para leerse.
 */

const MAX_BODY = 4000

type ConversationContext = {
  id: string
  zernio_conversation_id: string
  platform: string
  last_inbound_at: string | null
  status: string
  account: { zernio_account_id: string; is_active: boolean } | null
}

/**
 * Envía una respuesta y la deja registrada.
 *
 * El orden importa: **primero Zernio, después la base**. Si se guardara primero
 * y el envío fallara, la Bandeja mostraría un mensaje que el cliente nunca
 * recibió — que es exactamente la clase de mentira que arruina un CRM. Al revés,
 * lo peor que pasa es que el mensaje llegue y no se vea hasta que entre el
 * webhook `message.sent`, que trae el mismo id y lo materializa igual.
 */
export async function sendSocialMessage(
  conversationId: string,
  body: string
): Promise<ActionResult<{ messageId: string }>> {
  let supabase
  let profileId: string

  try {
    const member = await requireMember()
    supabase = member.supabase
    profileId = member.profile.id
  } catch (error) {
    return { error: authorizationMessage(error) }
  }

  const text = body.trim()
  if (!text) return { error: "Escribí un mensaje antes de enviarlo." }
  if (text.length > MAX_BODY) {
    return { error: `El mensaje supera los ${MAX_BODY} caracteres.` }
  }

  const config = readZernioConfig()
  if (!config.configured) return { error: config.reason }

  const { data: conversation } = await supabase
    .from("social_conversations")
    .select(
      "id, zernio_conversation_id, platform, last_inbound_at, status, account:social_accounts(zernio_account_id, is_active)"
    )
    .eq("id", conversationId)
    .maybeSingle<ConversationContext>()

  if (!conversation) return { error: "No se encontró la conversación." }
  if (!conversation.account) return { error: "La conversación no tiene cuenta asociada." }
  if (!conversation.account.is_active) {
    return {
      error: "La cuenta está desconectada en Zernio. Reconectala antes de responder.",
    }
  }

  // La ventana de 24h de WhatsApp se chequea ACÁ y no sólo en la UI: entre que
  // la pantalla se pintó y alguien terminó de escribir pueden pasar minutos.
  const window = messagingWindow(conversation.platform, conversation.last_inbound_at)
  if (window.state === "expired") {
    return {
      error:
        "Pasaron más de 24 horas desde el último mensaje del cliente. WhatsApp sólo acepta plantillas aprobadas fuera de esa ventana.",
    }
  }

  /**
   * Clave de idempotencia derivada del contenido y del minuto.
   *
   * Si el envío se corta por timeout no hay forma de saber si Zernio lo recibió.
   * Con esta clave, un reintento del mismo texto en el mismo minuto devuelve la
   * respuesta original en vez de mandarle el mensaje dos veces al cliente.
   */
  const idempotencyKey = `${conversationId}:${Math.floor(Date.now() / 60_000)}:${text.length}`

  const result = await sendMessage(
    { config },
    {
      conversationId: conversation.zernio_conversation_id,
      accountId: conversation.account.zernio_account_id,
      body: text,
      idempotencyKey,
    }
  )

  if (!result.ok) return { error: result.message }

  const now = new Date().toISOString()
  const { data: inserted, error } = await supabase
    .from("social_messages")
    .insert({
      conversation_id: conversation.id,
      // Si Zernio no devolvió id, se genera uno local para no perder el mensaje.
      // No colisiona con los de Zernio porque lleva prefijo propio.
      zernio_message_id: result.data.messageId ?? `local:${randomUUID()}`,
      direction: "outbound",
      body: text,
      delivery_status: "sent",
      sent_by: profileId,
      sent_at: now,
    })
    .select("id")
    .single()

  if (error || !inserted) {
    // El mensaje SÍ salió. Decirlo es más útil que un "no se pudo enviar" falso.
    return {
      error:
        "El mensaje se envió, pero no se pudo registrar en el CRM. Va a aparecer cuando llegue la confirmación de Zernio.",
    }
  }

  await supabase
    .from("social_conversations")
    .update({
      last_message_at: now,
      last_message_preview: text.slice(0, 180),
      unread_count: 0,
      last_read_at: now,
      last_read_by: profileId,
    })
    .eq("id", conversation.id)

  await writeAudit(supabase, profileId, "social_conversation", conversation.id, "replied", {
    platform: conversation.platform,
  })

  revalidatePath("/bandeja")
  return { ok: true, data: { messageId: inserted.id } }
}

/** Marca el hilo como atendido por el equipo. */
export async function markSocialConversationRead(
  conversationId: string
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()

    const { error } = await supabase
      .from("social_conversations")
      .update({
        unread_count: 0,
        last_read_at: new Date().toISOString(),
        last_read_by: profile.id,
      })
      .eq("id", conversationId)

    if (error) return { error: "No se pudo marcar como leída." }

    revalidatePath("/bandeja")
    revalidatePath("/")
    return { ok: true }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function setSocialConversationStatus(
  conversationId: string,
  status: "open" | "resolved" | "archived"
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()

    const { error } = await supabase
      .from("social_conversations")
      .update({ status })
      .eq("id", conversationId)

    if (error) return { error: "No se pudo cambiar el estado de la conversación." }

    await writeAudit(supabase, profile.id, "social_conversation", conversationId, status)
    revalidatePath("/bandeja")
    return { ok: true, message: status === "resolved" ? "Conversación resuelta." : "Listo." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

/**
 * Convierte una conversación en un lead del pipeline.
 *
 * Es el diferencial del CRM sobre la app de WhatsApp: el chat deja de ser un
 * chat y pasa a ser una oportunidad con dueño y seguimiento. Crea el contacto
 * con lo que la plataforma haya dado —a veces sólo un nombre— y deja el hilo
 * enlazado, para no perder de dónde salió.
 */
export async function convertConversationToLead(
  conversationId: string
): Promise<ActionResult<{ leadId: string }>> {
  try {
    const { supabase, profile } = await requireMember()

    const { data: conversation } = await supabase
      .from("social_conversations")
      .select("id, platform, participant_name, participant_handle, lead_id")
      .eq("id", conversationId)
      .maybeSingle()

    if (!conversation) return { error: "No se encontró la conversación." }
    if (conversation.lead_id) {
      return { error: "Esta conversación ya está enlazada a un lead." }
    }

    const displayName =
      conversation.participant_name ??
      conversation.participant_handle ??
      "Contacto sin nombre"

    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .insert({
        full_name: displayName,
        notes: `Contacto originado en ${conversation.platform}.`,
      })
      .select("id")
      .single()

    if (contactError || !contact) return { error: "No se pudo crear el contacto." }

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .insert({
        contact_id: contact.id,
        source: "inbound" as Enums<"lead_source">,
        owner_id: profile.id,
        notes: `Escribió por ${conversation.platform}${
          conversation.participant_handle ? ` (@${conversation.participant_handle})` : ""
        }.`,
      })
      .select("id")
      .single()

    if (leadError || !lead) return { error: "No se pudo crear el lead." }

    await supabase
      .from("social_conversations")
      .update({ lead_id: lead.id })
      .eq("id", conversationId)

    await writeAudit(supabase, profile.id, "lead", lead.id, "created_from_conversation", {
      conversationId,
      platform: conversation.platform,
    })

    revalidatePath("/bandeja")
    revalidatePath("/leads")

    return { ok: true, data: { leadId: lead.id }, message: `Lead creado: ${displayName}.` }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}
