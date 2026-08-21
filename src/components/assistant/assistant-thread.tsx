"use client"

import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { ArrowDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { greetingFor } from "@/lib/assistant/ui"
import { OperonArc } from "@/components/brand/operon-arc"
import { useAssistant } from "./assistant-provider"
import { AssistantMessage } from "./assistant-message"

/** Distancia al fondo que todavía cuenta como "estoy mirando lo último". */
const PINNED_PX = 64

export function AssistantThread() {
  const {
    turns,
    streamingText,
    status,
    configured,
    preferredName,
    fullName,
    greetingSeed,
    retryLast,
    send,
  } = useAssistant()

  const scrollRef = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(true)

  // Sólo seguir el scroll si la persona ya estaba mirando el final. Arrastrar
  // a alguien que subió a leer es el comportamiento más odiado de un chat.
  useLayoutEffect(() => {
    if (!pinned) return
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [turns, streamingText, pinned])

  function onScroll() {
    const node = scrollRef.current
    if (!node) return
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight
    setPinned(distance < PINNED_PX)
  }

  const empty = turns.length === 0

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full overflow-y-auto overscroll-contain px-4 py-4 sm:px-5"
      >
        {empty ? (
          <EmptyState
            preferredName={preferredName}
            fullName={fullName}
            seed={greetingSeed}
            configured={configured}
            onPick={send}
          />
        ) : (
          <div className="mx-auto max-w-3xl space-y-5">
            {turns.map((turn, index) => {
              const isLast = index === turns.length - 1
              const isStreaming =
                isLast && turn.role === "assistant" && status === "streaming"
              return (
                <AssistantMessage
                  key={turn.id}
                  turn={turn}
                  streamingText={isStreaming ? streamingText : undefined}
                  isStreaming={isStreaming}
                  onRetry={turn.error ? retryLast : undefined}
                />
              )
            })}
          </div>
        )}
      </div>

      {!pinned && !empty && (
        <button
          type="button"
          onClick={() => setPinned(true)}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 label-mono text-[#FBF9F4] backdrop-blur transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning motion-reduce:transition-none"
        >
          <ArrowDown className="size-3" aria-hidden="true" />
          Ir al final
        </button>
      )}
    </div>
  )
}

/** Sugerencias honestas: lo que un asistente con buscador web sí puede hacer. */
const SUGGESTIONS = [
  "Explicame qué conviene mirar cuando un proyecto se atrasa",
  "Buscá qué cambió en la última versión de Next.js",
  "Ayudame a redactar un mensaje de seguimiento a un cliente",
]

function EmptyState({
  preferredName,
  fullName,
  seed,
  configured,
  onPick,
}: {
  preferredName: string
  fullName: string
  seed: number
  configured: boolean
  onPick: (message: string) => void
}) {
  // Se deriva en el render, no en un efecto: el panel sólo existe después de
  // que alguien lo abre, así que no hay render de servidor con el que
  // desajustarse, y así tampoco parpadea vacío en el primer frame.
  const saludo = useMemo(
    () => greetingFor({ preferredName, fullName, seed }),
    [preferredName, fullName, seed]
  )

  return (
    <div className="relative mx-auto flex h-full max-w-md flex-col items-center justify-center overflow-hidden text-center">
      <OperonArc className="-top-24 -right-20 opacity-40" />
      <div className="relative z-10">
        <p className="font-heading text-xl leading-tight font-semibold tracking-tight text-[#FBF9F4] sm:text-2xl">
          {saludo || " "}
        </p>

        {configured ? (
          <div className="mt-6 flex flex-col gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onPick(suggestion)}
                className={cn(
                  "rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5",
                  "text-left text-sm text-[#FBF9F4]/75 transition",
                  "hover:border-white/20 hover:bg-white/[0.07] hover:text-[#FBF9F4]",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning",
                  "motion-reduce:transition-none"
                )}
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm leading-relaxed text-[#FBF9F4]/60">
            Cuando esté conectada vas a poder preguntarle acá.
          </p>
        )}
      </div>
    </div>
  )
}
