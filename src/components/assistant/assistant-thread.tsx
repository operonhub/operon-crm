"use client"

import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { ArrowDown, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { greetingFor } from "@/lib/assistant/ui"
import { setPreferredName } from "@/app/(app)/assistant-actions"
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
    applyIdentity,
    displayName,
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
            onNameChosen={(name) =>
              applyIdentity({ displayName, preferredName: name })
            }
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
  onNameChosen,
}: {
  preferredName: string
  fullName: string
  seed: number
  configured: boolean
  onPick: (message: string) => void
  onNameChosen: (name: string) => void
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

        {/*
          La primera vez el saludo sale del nombre real del perfil. Preguntarlo
          acá es lo único que hace que la preferencia se pueda escribir sin ir
          a buscarla a la configuración.
        */}
        {!preferredName && <NamePrompt onDone={onNameChosen} />}

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

/**
 * Pedido de nombre de la primera vez.
 *
 * Se ofrece, no se impone: se puede ignorar y seguir usando el panel. Si nadie
 * lo completa, el saludo sigue saliendo del nombre del perfil, que también es
 * correcto — sólo menos suyo.
 */
function NamePrompt({ onDone }: { onDone: (name: string) => void }) {
  const [value, setValue] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    const name = value.trim()
    if (!name || saving) return
    setSaving(true)
    setError(null)

    const result = await setPreferredName(name)
    setSaving(false)
    if ("error" in result) {
      setError(result.error)
      return
    }
    onDone(result.preferences.preferredUserName)
  }

  return (
    <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left">
      <label
        htmlFor="preferred-name"
        className="label-mono block text-[#FBF9F4]/60"
      >
        ¿Cómo querés que te diga?
      </label>
      <div className="mt-2 flex items-center gap-2">
        <input
          id="preferred-name"
          type="text"
          value={value}
          maxLength={60}
          placeholder="Tu nombre o el apodo que quieras"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              void guardar()
            }
          }}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-sm text-[#FBF9F4] transition-colors placeholder:text-[#FBF9F4]/30 focus:border-white/25 focus:outline-none motion-reduce:transition-none"
        />
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={!value.trim() || saving}
          aria-label="Guardar nombre"
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg transition",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning",
            "motion-reduce:transition-none",
            value.trim() && !saving
              ? "bg-white/10 text-[#FBF9F4] hover:bg-white/20"
              : "cursor-not-allowed bg-white/[0.05] text-[#FBF9F4]/25"
          )}
        >
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
