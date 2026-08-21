"use client"

/**
 * Estado de Operon IA.
 *
 * Vive acá y no en el panel a propósito: el panel se desmonta al cerrarse, y
 * si el stream viviera adentro, cerrar mientras responde cortaría la respuesta.
 * Con el loop acá, Santiago puede cerrar el panel, seguir trabajando y volver a
 * abrirlo con la respuesta ya completa.
 *
 * REGLA DE IMPORTS: este árbol es cliente. Sólo puede traer de
 * `@/lib/assistant/{stream,request,policy,ui}`. Nunca `service` (tiene
 * `server-only`), ni `config`/`provider` (arrastran `node:crypto`).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { usePathname } from "next/navigation"
import { MAX_MESSAGE_LENGTH } from "@/lib/assistant/request"
import { parseAssistantEvent, splitSseChunk } from "@/lib/assistant/stream"
import {
  pathToContext,
  type AssistantStatus,
  type ConversationSummary,
  type PageContext,
} from "@/lib/assistant/ui"

export type Turn = {
  id: string
  role: "user" | "assistant"
  content: string
  /** Herramientas que Hermes usó en este turno. Sale de eventos reales. */
  tools: { name: string; status: string }[]
  error: string | null
  /** Una respuesta detenida a mano puede no haber quedado guardada. */
  stopped: boolean
}

type AssistantState = {
  open: boolean
  expanded: boolean
  status: AssistantStatus
  configured: boolean
  turns: Turn[]
  /** Texto que está llegando ahora mismo. Separado para no re-renderizar todo. */
  streamingText: string
  conversationId: string | null
  conversations: ConversationSummary[]
  context: PageContext
  greetingSeed: number
  displayName: string
  preferredName: string
  fullName: string
  setOpen: (open: boolean) => void
  toggleExpanded: () => void
  send: (message: string) => void
  stop: () => void
  retryLast: () => void
  newSession: () => void
}

const AssistantContext = createContext<AssistantState | null>(null)

export function useAssistant(): AssistantState {
  const value = useContext(AssistantContext)
  if (!value) {
    throw new Error("useAssistant debe usarse dentro de AssistantProvider")
  }
  return value
}

let turnCounter = 0
const nextTurnId = () => `turn-${++turnCounter}`

export function AssistantProvider({
  configured,
  displayName,
  preferredName,
  fullName,
  initialConversations,
  children,
}: {
  configured: boolean
  displayName: string
  preferredName: string
  fullName: string
  initialConversations: ConversationSummary[]
  children: React.ReactNode
}) {
  const pathname = usePathname()

  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [status, setStatus] = useState<AssistantStatus>("idle")
  const [turns, setTurns] = useState<Turn[]>([])
  const [streamingText, setStreamingText] = useState("")
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [greetingSeed, setGreetingSeed] = useState(0)

  /**
   * Los datos del servidor son semilla, no fuente continua: `RefreshOnFocus`
   * dispara `router.refresh()` al volver a la pestaña y cambiaría la identidad
   * de estos props. Sincronizarlos por efecto borraría una charla en curso.
   */
  const [conversations] = useState(() => initialConversations)

  const abortRef = useRef<AbortController | null>(null)
  const bufferRef = useRef("")
  const frameRef = useRef(0)
  const lastMessageRef = useRef("")

  const context = useMemo(() => pathToContext(pathname), [pathname])

  /** Vuelca el texto acumulado a estado como mucho una vez por frame. */
  const scheduleFlush = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0
      setStreamingText(bufferRef.current)
    })
  }, [])

  const cancelFlush = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
    }
  }, [])

  /** Cierra el turno en curso y lo pasa al historial. */
  const finishTurn = useCallback(
    (patch: Partial<Pick<Turn, "error" | "stopped">> = {}) => {
      cancelFlush()
      const content = bufferRef.current
      bufferRef.current = ""
      setStreamingText("")
      setTurns((prev) =>
        prev.map((turn, index) =>
          index === prev.length - 1 && turn.role === "assistant"
            ? { ...turn, content, ...patch }
            : turn
        )
      )
    },
    [cancelFlush]
  )

  const send = useCallback(
    async (rawMessage: string) => {
      const message = rawMessage.trim()
      if (!message || message.length > MAX_MESSAGE_LENGTH) return
      if (status === "streaming") return

      lastMessageRef.current = message
      bufferRef.current = ""
      setStreamingText("")
      setStatus("streaming")
      setTurns((prev) => [
        ...prev,
        {
          id: nextTurnId(),
          role: "user",
          content: message,
          tools: [],
          error: null,
          stopped: false,
        },
        {
          id: nextTurnId(),
          role: "assistant",
          content: "",
          tools: [],
          error: null,
          stopped: false,
        },
      ])

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const response = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, conversationId, context }),
          signal: controller.signal,
        })

        // Se lee ANTES del cuerpo: la cabecera llega con la respuesta. Si el
        // stream muere en el primer byte, igual sabemos qué conversación se
        // creó y no queda huérfana en la lista.
        const created = response.headers.get("X-Conversation-Id")
        if (created) setConversationId(created)

        if (!response.ok) {
          // Los errores del route vienen como JSON, no como SSE.
          const body = (await response.json().catch(() => null)) as
            | { error?: string }
            | null
          finishTurn({
            error: body?.error ?? "Operon IA no pudo responder.",
          })
          setStatus("error")
          return
        }

        if (!response.body) {
          finishTurn({ error: "Operon IA no devolvió una respuesta." })
          setStatus("error")
          return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let sse = ""
        let failure: string | null = null

        for (;;) {
          const { done, value } = await reader.read()
          if (done) break

          sse += decoder.decode(value, { stream: true })
          const { events, rest } = splitSseChunk(sse)
          sse = rest

          for (const payload of events) {
            const event = parseAssistantEvent(payload)
            if (!event) continue

            if (event.type === "text") {
              bufferRef.current += event.delta
              scheduleFlush()
            } else if (event.type === "tool") {
              setTurns((prev) =>
                prev.map((turn, index) =>
                  index === prev.length - 1
                    ? {
                        ...turn,
                        tools: [
                          ...turn.tools.filter((t) => t.name !== event.name),
                          { name: event.name, status: event.status },
                        ],
                      }
                    : turn
                )
              )
            } else if (event.type === "error") {
              failure = event.message
            }
          }
        }
        // Un `rest` sin terminar se descarta: nunca renderizar medio JSON.

        finishTurn({ error: failure })
        setStatus(failure ? "error" : "idle")
      } catch (error) {
        if ((error as Error)?.name === "AbortError") {
          finishTurn({ stopped: true })
          setStatus("idle")
          return
        }
        finishTurn({ error: "Se perdió la conexión con Operon IA." })
        setStatus("error")
      } finally {
        abortRef.current = null
      }
    },
    [context, conversationId, finishTurn, scheduleFlush, status]
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const retryLast = useCallback(() => {
    if (!lastMessageRef.current || status === "streaming") return
    // Se quitan el turno fallido y su pregunta: el reintento los reemplaza.
    setTurns((prev) => prev.slice(0, -2))
    void send(lastMessageRef.current)
  }, [send, status])

  const newSession = useCallback(() => {
    abortRef.current?.abort()
    cancelFlush()
    bufferRef.current = ""
    setStreamingText("")
    setTurns([])
    setConversationId(null)
    setStatus("idle")
    setGreetingSeed((seed) => seed + 1)
  }, [cancelFlush])

  // Atajo global. Se ignora si el foco está escribiendo en otro lado del CRM.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "k" || !(event.metaKey || event.ctrlKey)) return
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      if (typing && !open) return
      event.preventDefault()
      setOpen((value) => !value)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open])

  // Al desmontar (por ejemplo al salir de la sesión) no dejar un fetch colgado.
  useEffect(() => () => abortRef.current?.abort(), [])

  const value = useMemo<AssistantState>(
    () => ({
      open,
      expanded,
      status,
      configured,
      turns,
      streamingText,
      conversationId,
      conversations,
      context,
      greetingSeed,
      displayName,
      preferredName,
      fullName,
      setOpen,
      toggleExpanded: () => setExpanded((value) => !value),
      send: (message: string) => void send(message),
      stop,
      retryLast,
      newSession,
    }),
    [
      open,
      expanded,
      status,
      configured,
      turns,
      streamingText,
      conversationId,
      conversations,
      context,
      greetingSeed,
      displayName,
      preferredName,
      fullName,
      send,
      stop,
      retryLast,
      newSession,
    ]
  )

  return (
    <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>
  )
}
