"use server"

/**
 * Lectura y mantenimiento de las conversaciones de Operon IA.
 *
 * Son server actions y no consultas desde el navegador porque ningún
 * componente del CRM usa el cliente de Supabase del lado del cliente: mantener
 * esa convención deja un solo lugar donde auditar quién lee qué.
 *
 * A diferencia del resto del repo, acá NO se llama a `revalidatePath`. El
 * estado del panel vive fuera del árbol RSC —es la razón por la que sobrevive
 * a navegar— así que revalidar volvería a ejecutar `AssistantMount` para
 * producir props que el provider ignora a propósito. Estas acciones devuelven
 * los datos y el provider los aplica a su propio estado.
 *
 * La propiedad la verifica RLS. Si el id es de la otra persona, la consulta
 * devuelve vacío y se trata como inexistente; comparar `owner_user_id` a mano
 * crearía un segundo lugar donde el permiso puede quedar desincronizado.
 */

import { authorizationMessage, requireMember } from "@/lib/auth"
import type { AssistantPreferences } from "@/lib/assistant/policy"
import { loadPreferences, savePreferences } from "@/lib/assistant/service"
import type { ConversationSummary } from "@/lib/assistant/ui"

/** Un turno tal como quedó guardado. Menos rico que uno en vivo: ver abajo. */
export type StoredTurn = {
  id: string
  role: "user" | "assistant"
  content: string
  /** `error` marca una respuesta que se cortó a mitad de camino. */
  incomplete: boolean
}

export type LoadResult =
  | { conversation: ConversationSummary; turns: StoredTurn[] }
  | { error: string }

/** Igual que en `AssistantMount`: alcanza para el cajón, no para paginar. */
const LIST_LIMIT = 30

/** Un hilo más largo que esto no entra en la ventana de Hermes igual. */
const TURN_LIMIT = 200

/**
 * Devuelve un resultado y no un array a secas: una lista vacía porque todavía
 * no hay conversaciones y una lista vacía porque la lectura falló son cosas
 * distintas, y quien llama tiene que poder distinguirlas. Devolver `[]` para
 * las dos haría que un error de sesión se vea igual que empezar de cero.
 */
export async function listConversations(): Promise<
  { conversations: ConversationSummary[] } | { error: string }
> {
  try {
    const { supabase } = await requireMember()
    const { data, error } = await supabase
      .from("assistant_conversations")
      .select("id, title, updated_at")
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(LIST_LIMIT)

    if (error) return { error: "No se pudo leer la lista de conversaciones." }
    return { conversations: (data ?? []) as ConversationSummary[] }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function loadConversation(
  conversationId: string
): Promise<LoadResult> {
  try {
    const { supabase } = await requireMember()

    const { data: conversation } = await supabase
      .from("assistant_conversations")
      .select("id, title, updated_at")
      .eq("id", conversationId)
      .maybeSingle()

    if (!conversation) {
      return { error: "Esa conversación no existe o no es tuya." }
    }

    const { data: messages, error } = await supabase
      .from("assistant_messages")
      .select("id, role, content, status")
      .eq("conversation_id", conversationId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true })
      .limit(TURN_LIMIT)

    if (error) return { error: "No se pudieron leer los mensajes." }

    return {
      conversation: conversation as ConversationSummary,
      turns: (messages ?? []).map((message) => ({
        id: message.id,
        role: message.role as "user" | "assistant",
        content: message.content,
        incomplete: message.status === "error",
      })),
    }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

/**
 * Archiva, no borra. La política de Operon IA prohíbe destruir datos sin
 * confirmación explícita, y una conversación archivada se puede recuperar
 * desde la base si alguien se arrepiente.
 */
export async function archiveConversation(
  conversationId: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const { supabase } = await requireMember()
    const { error } = await supabase
      .from("assistant_conversations")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", conversationId)

    if (error) return { error: "No se pudo archivar la conversación." }
    return { ok: true }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

/**
 * El título arranca siendo el primer mensaje recortado. Renombrar es lo que
 * convierte una lista de frases sueltas en algo que se puede recorrer.
 */
export async function renameConversation(
  conversationId: string,
  rawTitle: string
): Promise<{ ok: true; title: string } | { error: string }> {
  const title = rawTitle.trim().slice(0, 120)
  if (!title) return { error: "El título no puede quedar vacío." }

  try {
    const { supabase } = await requireMember()
    const { error } = await supabase
      .from("assistant_conversations")
      .update({ title })
      .eq("id", conversationId)

    if (error) return { error: "No se pudo renombrar la conversación." }
    return { ok: true, title }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

// -------------------------------------------------------------- preferencias

/**
 * Preferencias de estilo de la persona.
 *
 * `loadPreferences` no crea la fila si no existe: devuelve el perfil neutral.
 * Por eso hace falta este escritor — sin él nadie puede tocar
 * `preferred_user_name` y el saludo nunca sale del respaldo.
 */
export async function readPreferences(): Promise<
  { preferences: AssistantPreferences } | { error: string }
> {
  try {
    const { supabase, user } = await requireMember()
    return { preferences: await loadPreferences(supabase, user.id) }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

/**
 * Guarda preferencias de estilo. Nunca de permisos: qué puede hacer Operon IA
 * lo decide la política del servidor, no una elección de esta pantalla.
 */
export async function writePreferences(
  raw: unknown
): Promise<{ preferences: AssistantPreferences } | { error: string }> {
  try {
    const { supabase, user } = await requireMember()
    return await savePreferences(supabase, user.id, raw)
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

/**
 * Guarda sólo cómo quiere que le digan, sin tocar el resto.
 *
 * Existe como acción propia y no como una llamada a `writePreferences` con un
 * objeto parcial porque `sanitizePreferences` completa con valores por defecto
 * todo lo que no venga: mandar sólo el nombre desde el cliente reescribiría el
 * tono, el humor y las notas libres. Acá se lee, se modifica y se escribe del
 * lado del servidor, así no hay manera de llamarla mal.
 */
export async function setPreferredName(
  rawName: string
): Promise<{ preferences: AssistantPreferences } | { error: string }> {
  const preferredUserName = rawName.trim()
  if (!preferredUserName) return { error: "Escribí un nombre." }

  try {
    const { supabase, user } = await requireMember()
    const current = await loadPreferences(supabase, user.id)
    return await savePreferences(supabase, user.id, {
      ...current,
      preferredUserName,
    })
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}
