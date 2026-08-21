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
import {
  archiveConversation,
  listConversations,
  loadConversation,
  renameConversation,
} from "@/app/(app)/assistant-actions"
import { MAX_MESSAGE_LENGTH } from "@/lib/assistant/request"
import { parseAssistantEvent, splitSseChunk } from "@/lib/assistant/stream"
import {
  pathToContext,
  type AssistantStatus,
  type ConversationSummary,
  type PageContext,
} from "@/lib/assistant/ui"

/** El panel muestra una cosa por vez: el hilo o la configuración. */
export type AssistantView = "chat" | "preferences"

export type Turn = {
  id: string
  role: "user" | "assistant"
  content: string
  /** Herramientas que Hermes usó en este turno. Sale de eventos reales. */
  tools: { name: string; status: string }[]
  error: string | null
  /** Una respuesta detenida a mano puede no haber quedado guardada. */
  stopped: boolean
  /**
   * Guardada pero cortada antes de terminar. Distinto de `error`: acá no hay
   * nada que reintentar, sólo hay que avisar que el texto está incompleto.
   */
  incomplete: boolean
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
  drawerOpen: boolean
  /** Id que se está abriendo, para mostrar en cuál esperar. */
  loadingConversationId: string | null
  view: AssistantView
  context: PageContext
  greetingSeed: number
  displayName: string
  preferredName: string
  fullName: string
  setOpen: (open: boolean) => void
  toggleExpanded: () => void
  setDrawerOpen: (open: boolean) => void
  setView: (view: AssistantView) => void
  /**
   * Refresca el nombre del asistente y el de la persona sin recargar. Lo llama
   * la pantalla de preferencias al guardar, para que el encabezado y el saludo
   * cambien en el acto.
   */
  applyIdentity: (identity: {
    displayName: string
    preferredName: string
  }) => void
  send: (message: string) => void
  stop: () => void
  retryLast: () => void
  newSession: () => void
  openConversation: (id: string) => void
  archive: (id: string) => void
  rename: (id: string, title: string) => void
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
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [loadingConversationId, setLoadingConversationId] = useState<
    string | null
  >(null)
  const [view, setView] = useState<AssistantView>("chat")

  /**
   * Semilla del servidor, igual que las conversaciones, pero acá sí puede
   * cambiar en vivo: al guardar preferencias queremos ver el nombre nuevo sin
   * recargar la página.
   */
  const [identity, setIdentity] = useState(() => ({
    displayName,
    preferredName,
  }))

  /**
   * Los datos del servidor son semilla, no fuente continua: `RefreshOnFocus`
   * dispara `router.refresh()` al volver a la pestaña y cambiaría la identidad
   * de estos props. Sincronizarlos por efecto borraría una charla en curso.
   *
   * La lista sí se actualiza, pero sólo desde acciones que alguien pidió
   * (mandar un mensaje, archivar, renombrar). Es la distinción que importa:
   * reaccionar a un prop que cambió solo, no; reaccionar a un acto, sí.
   */
  const [conversations, setConversations] = useState(() => initialConversations)

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

  /**
   * Vuelve a pedir la lista al servidor en vez de insertar la fila a mano.
   * El título lo arma el backend recortando el primer mensaje; replicar esa
   * regla acá sería una segunda copia que tarde o temprano se despega. Además
   * así el orden por `updated_at` sale bien sin recalcularlo.
   */
  const refreshList = useCallback(async () => {
    const result = await listConversations()
    // Si la lectura falló se deja la lista que ya había: vaciarla haría
    // parecer que las conversaciones se perdieron.
    if ("conversations" in result) setConversations(result.conversations)
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
          incomplete: false,
        },
        {
          id: nextTurnId(),
          role: "assistant",
          content: "",
          tools: [],
          error: null,
          stopped: false,
          incomplete: false,
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
        // También tras un error o un corte: si la conversación llegó a
        // crearse, tiene que aparecer en la lista igual.
        void refreshList()
      }
    },
    [context, conversationId, finishTurn, refreshList, scheduleFlush, status]
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
    setDrawerOpen(false)
    setGreetingSeed((seed) => seed + 1)
  }, [cancelFlush])

  /**
   * Trae una conversación guardada y la pone en pantalla.
   *
   * Corta lo que esté respondiendo antes de reemplazar el hilo: dejar un
   * stream vivo escribiendo sobre una conversación recién abierta mezclaría
   * dos charlas distintas en la misma pantalla.
   */
  const openConversation = useCallback(
    async (id: string) => {
      abortRef.current?.abort()
      cancelFlush()
      bufferRef.current = ""
      setStreamingText("")
      setLoadingConversationId(id)

      const result = await loadConversation(id)
      setLoadingConversationId(null)

      if ("error" in result) {
        setTurns([
          {
            id: nextTurnId(),
            role: "assistant",
            content: "",
            tools: [],
            error: result.error,
            stopped: false,
            incomplete: false,
          },
        ])
        setStatus("error")
        return
      }

      setTurns(
        result.turns.map((turn) => ({
          id: turn.id,
          role: turn.role,
          content: turn.content,
          // Las herramientas no se guardan todavía, así que un turno releído
          // no las muestra. Mejor eso que inventar cuáles fueron.
          tools: [],
          error: null,
          stopped: false,
          incomplete: turn.incomplete,
        }))
      )
      setConversationId(result.conversation.id)
      setStatus("idle")
      setDrawerOpen(false)
      // Reintentar no tiene sentido sobre un hilo releído: no hay un último
      // mensaje "en vuelo" que reenviar.
      lastMessageRef.current = ""
    },
    [cancelFlush]
  )

  const archive = useCallback(
    async (id: string) => {
      // Optimista: la fila desaparece al instante y el servidor confirma.
      setConversations((prev) => prev.filter((item) => item.id !== id))
      if (id === conversationId) newSession()

      const result = await archiveConversation(id)
      // Si falló, la lista vuelve a lo que dice el servidor.
      if ("error" in result) void refreshList()
    },
    [conversationId, newSession, refreshList]
  )

  const rename = useCallback(
    async (id: string, title: string) => {
      const result = await renameConversation(id, title)
      if ("error" in result) return
      setConversations((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, title: result.title } : item
        )
      )
    },
    []
  )

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
      drawerOpen,
      loadingConversationId,
      view,
      context,
      greetingSeed,
      displayName: identity.displayName,
      preferredName: identity.preferredName,
      fullName,
      setOpen,
      toggleExpanded: () => setExpanded((value) => !value),
      setDrawerOpen,
      setView,
      applyIdentity: setIdentity,
      send: (message: string) => void send(message),
      stop,
      retryLast,
      newSession,
      openConversation: (id: string) => void openConversation(id),
      archive: (id: string) => void archive(id),
      rename: (id: string, title: string) => void rename(id, title),
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
      drawerOpen,
      loadingConversationId,
      view,
      context,
      greetingSeed,
      identity,
      fullName,
      send,
      stop,
      retryLast,
      newSession,
      openConversation,
      archive,
      rename,
    ]
  )

  return (
    <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>
  )
}
