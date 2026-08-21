import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { buildInstructions, sanitizePreferences } from "./policy"
import { readHermesConfig } from "./config"
import { streamFromHermes, type StreamMessage } from "./provider"
import type { AssistantEvent } from "./stream"
import type { ChatRequest, ContextType } from "./request"

/**
 * Orquestación del chat, del lado del servidor.
 *
 * Todo lo que define identidad —quién pregunta, qué preferencias tiene, a qué
 * conversación pertenece el mensaje— se resuelve acá con la sesión de
 * Supabase. Nada de eso llega desde el navegador.
 */

type Db = SupabaseClient<Database>

/** Cuántos mensajes previos se mandan como contexto de la charla. */
const HISTORY_LIMIT = 20

// ------------------------------------------------------------ preferencias

/**
 * Carga las preferencias de la persona. Si todavía no configuró nada, devuelve
 * el perfil neutral sin escribir en la base: crear la fila es responsabilidad
 * de la pantalla de configuración, no de una consulta.
 */
export async function loadPreferences(db: Db, userId: string) {
  const { data } = await db
    .from("assistant_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  return sanitizePreferences(
    data
      ? {
          displayName: data.display_name,
          preferredUserName: data.preferred_user_name,
          tone: data.tone,
          technicalLevel: data.technical_level,
          verbosity: data.verbosity,
          humorLevel: data.humor_level,
          geekReferenceFrequency: data.geek_reference_frequency,
          proactivityLevel: data.proactivity_level,
          responseFormat: data.preferred_response_format,
          language: data.preferred_language,
          customPreferences: data.custom_preferences,
        }
      : undefined
  )
}

// --------------------------------------------------------------- contexto

const CONTEXT_SOURCES: Partial<
  Record<ContextType, { table: "projects" | "clients" | "opportunities"; label: string }>
> = {
  project: { table: "projects", label: "Proyecto" },
  client: { table: "clients", label: "Cliente" },
  opportunity: { table: "opportunities", label: "Oportunidad" },
}

/**
 * Traduce el contexto de página a algo que se le puede contar al modelo.
 *
 * Revalida el id contra la base con la sesión de la persona: si no existe o no
 * lo puede ver, devuelve `null`. El navegador dice dónde cree estar; la base
 * decide si eso es cierto.
 */
export async function resolveContextLabel(
  db: Db,
  context: ChatRequest["context"]
): Promise<string | null> {
  const source = CONTEXT_SOURCES[context.type]
  if (!source || !context.id) return null

  if (source.table === "clients") {
    const { data } = await db
      .from("clients")
      .select("organization:organizations(name)")
      .eq("id", context.id)
      .maybeSingle()
    return data?.organization?.name ? `${source.label}: ${data.organization.name}` : null
  }

  const { data } = await db
    .from(source.table)
    .select(source.table === "projects" ? "name" : "title")
    .eq("id", context.id)
    .maybeSingle()

  const nombre = (data as { name?: string; title?: string } | null)?.name ??
    (data as { title?: string } | null)?.title
  return nombre ? `${source.label}: ${nombre}` : null
}

// ---------------------------------------------------------- conversación

/**
 * Devuelve la conversación pedida o crea una nueva.
 *
 * La verificación de propiedad la hace RLS: si el id es de otra persona, la
 * consulta no devuelve nada y se trata como inexistente. No hace falta —ni
 * conviene— comparar dueños a mano.
 */
export async function resolveConversation(
  db: Db,
  userId: string,
  request: ChatRequest
): Promise<{ id: string } | { error: string }> {
  if (request.conversationId) {
    const { data } = await db
      .from("assistant_conversations")
      .select("id")
      .eq("id", request.conversationId)
      .maybeSingle()

    if (!data) return { error: "Esa conversación no existe o no es tuya." }
    return { id: data.id }
  }

  const { data, error } = await db
    .from("assistant_conversations")
    .insert({
      owner_user_id: userId,
      // Título provisorio a partir del primer mensaje; la UI puede renombrarlo.
      title: request.message.slice(0, 60),
      context_type: request.context.type,
      context_id: request.context.id,
    })
    .select("id")
    .single()

  if (error || !data) {
    return { error: "No se pudo abrir la conversación." }
  }

  // La transcripción de Hermes se agrupa con nuestro propio id.
  await db
    .from("assistant_conversations")
    .update({ hermes_session_id: data.id })
    .eq("id", data.id)

  return { id: data.id }
}

async function loadHistory(db: Db, conversationId: string): Promise<StreamMessage[]> {
  const { data } = await db
    .from("assistant_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT)

  return (data ?? [])
    .reverse()
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
}

// ------------------------------------------------------------------ chat

export type ChatContext = {
  db: Db
  userId: string
  request: ChatRequest
  conversationId: string
  signal?: AbortSignal
}

/**
 * Corre un turno completo: guarda la pregunta, transmite la respuesta y la
 * persiste al final.
 *
 * Si algo falla, sale un evento de error y **no** se guarda una respuesta del
 * asistente: no queremos que el historial muestre como dicho algo que nunca
 * se dijo.
 */
export async function* runChatTurn(
  ctx: ChatContext
): AsyncIterable<AssistantEvent> {
  const { db, userId, request, conversationId } = ctx

  const [prefs, contextLabel, history] = await Promise.all([
    loadPreferences(db, userId),
    resolveContextLabel(db, request.context),
    loadHistory(db, conversationId),
  ])

  await db.from("assistant_messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: request.message,
  })

  const instructions = buildInstructions(prefs, { pageContext: contextLabel })

  let answer = ""
  let failed = false

  for await (const event of streamFromHermes(
    {
      instructions,
      messages: [...history, { role: "user", content: request.message }],
      userId,
      conversationId,
      signal: ctx.signal,
    },
    { config: readHermesConfig() }
  )) {
    if (event.type === "text") answer += event.delta
    if (event.type === "error") failed = true
    yield event
  }

  // Guardar aunque haya fallado a mitad de camino: lo que alcanzó a decir es
  // parte de la conversación, pero queda marcado como incompleto.
  if (answer) {
    await db.from("assistant_messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: answer,
      status: failed ? "error" : "complete",
    })
  }

  await db
    .from("assistant_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId)
}
