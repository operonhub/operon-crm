import { AuthorizationError, requireMember } from "@/lib/auth"
import { readHermesConfig } from "@/lib/assistant/config"
import { parseChatRequest } from "@/lib/assistant/request"
import { resolveConversation, runChatTurn } from "@/lib/assistant/service"
import type { AssistantEvent } from "@/lib/assistant/stream"

/**
 * Canal del CRM con Operon IA.
 *
 * La UI habla siempre con este endpoint, nunca con Hermes: acá es donde se
 * verifica la sesión de Supabase y se resuelve la identidad. Lo que venga en
 * el cuerpo del pedido es sólo el mensaje y una pista de contexto.
 */

const encoder = new TextEncoder()

function sse(event: AssistantEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status })
}

export async function POST(request: Request): Promise<Response> {
  // 1. Identidad real. Nunca la del cuerpo del pedido.
  let member
  try {
    member = await requireMember()
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : 401
    return jsonError(
      error instanceof AuthorizationError
        ? error.message
        : "No se pudo verificar tu sesión.",
      status
    )
  }

  // 2. Si el asistente no está conectado, se dice. No se simula una respuesta.
  const config = readHermesConfig()
  if (!config.configured) {
    return jsonError(
      "Operon IA todavía no está conectada. Falta configurar el acceso al asistente.",
      503
    )
  }

  // 3. Entrada validada por lista blanca.
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError("El pedido no tiene el formato esperado.", 400)
  }

  const parsed = parseChatRequest(body)
  if (!parsed.ok) return jsonError(parsed.error, 400)

  // 4. La conversación se resuelve contra la base; RLS verifica la propiedad.
  const conversation = await resolveConversation(
    member.supabase,
    member.user.id,
    parsed.value
  )
  if ("error" in conversation) return jsonError(conversation.error, 404)

  // 5. Streaming. Si el navegador se va, se corta el pedido a Hermes.
  const abort = new AbortController()
  request.signal.addEventListener("abort", () => abort.abort())

  const turn = runChatTurn({
    db: member.supabase,
    userId: member.user.id,
    request: parsed.value,
    conversationId: conversation.id,
    signal: abort.signal,
  })[Symbol.asyncIterator]()

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await turn.next()
        if (done) {
          controller.close()
          return
        }
        controller.enqueue(sse(value))
      } catch (error) {
        // El detalle queda en el servidor; al navegador va un mensaje neutro.
        console.error("[assistant] turno interrumpido", {
          conversation: conversation.id,
          message: (error as Error)?.message,
        })
        controller.enqueue(
          sse({
            type: "error",
            code: "internal",
            message: "Operon IA no pudo completar la respuesta.",
          })
        )
        controller.close()
      }
    },
    cancel() {
      abort.abort()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      // La conversación viaja en un header para que la UI la conserve sin
      // tener que esperar al primer evento.
      "X-Conversation-Id": conversation.id,
    },
  })
}
