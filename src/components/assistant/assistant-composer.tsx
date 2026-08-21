"use client"

import { useRef, useState } from "react"
import { ArrowUp, Info, Square, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { MAX_MESSAGE_LENGTH } from "@/lib/assistant/request"
import { contextLabel } from "@/lib/assistant/ui"
import { useAssistant } from "./assistant-provider"

/** A partir de acá mostramos el contador, no antes. */
const COUNTER_FROM = 7000

export function AssistantComposer() {
  const { send, stop, status, configured, context } = useAssistant()
  const [value, setValue] = useState("")
  const [useContext, setUseContext] = useState(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const streaming = status === "streaming"
  const tooLong = value.length > MAX_MESSAGE_LENGTH
  const canSend = configured && !streaming && value.trim().length > 0 && !tooLong

  function submit() {
    if (!canSend) return
    send(value)
    setValue("")
    if (textareaRef.current) textareaRef.current.style.height = "auto"
  }

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  return (
    <div className="shrink-0 border-t border-white/10 p-3 sm:p-4">
      {/*
        La fila de chips se muestra siempre, también sin conexión: es el estado
        en el que va a estar hasta que Hermes esté enchufado, y es donde el modo
        "Actuar" tiene que dejar clara la intención sin prometer nada.
      */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setUseContext((v) => !v)}
          aria-pressed={useContext}
          title={
            useContext
              ? "Operon IA sabe en qué pantalla estás"
              : "Preguntar sin decirle dónde estás"
          }
          className={cn(
            "label-mono inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning",
            "motion-reduce:transition-none",
            useContext
              ? "bg-white/[0.08] text-[#FBF9F4]/80"
              : "bg-transparent text-[#FBF9F4]/40 hover:text-[#FBF9F4]/70"
          )}
        >
          {contextLabel(context)}
          {useContext && <X className="size-3" aria-hidden="true" />}
        </button>

        {/* Preguntar / Actuar — Actuar queda a la vista pero apagado. */}
        <div
          role="group"
          aria-label="Modo"
          className="ml-auto inline-flex rounded-md bg-white/[0.06] p-0.5"
        >
          <span className="label-mono rounded-[5px] bg-white/10 px-2 py-1 text-[#FBF9F4]">
            Preguntar
          </span>
          <button
            type="button"
            disabled
            aria-disabled="true"
            title="Todavía no: Operon IA aún no puede modificar datos del CRM"
            className="label-mono cursor-not-allowed rounded-[5px] px-2 py-1 text-[#FBF9F4]/30"
          >
            Actuar
          </button>
        </div>
      </div>

      {!configured ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-warning/25 bg-warning/5 px-3.5 py-3">
          <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-0 text-sm leading-relaxed text-[#FBF9F4]/75">
            <p className="font-medium text-[#FBF9F4]">
              Operon IA todavía no está conectada.
            </p>
            <p className="mt-0.5">
              Falta configurar el acceso al asistente. El resto del panel funciona.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div
            className={cn(
              "flex items-end gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2",
              "transition-colors focus-within:border-white/25 motion-reduce:transition-none",
              tooLong && "border-destructive/50"
            )}
          >
            <textarea
              ref={textareaRef}
              value={value}
              rows={1}
              placeholder="Preguntale o pedile algo a Operon…"
              onChange={(event) => {
                setValue(event.target.value)
                autoGrow(event.target)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  submit()
                }
              }}
              className="max-h-40 min-h-6 flex-1 resize-none bg-transparent text-sm leading-relaxed text-[#FBF9F4] placeholder:text-[#FBF9F4]/35 focus:outline-none"
            />

            {streaming ? (
              <button
                type="button"
                onClick={stop}
                aria-label="Detener respuesta"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[#FBF9F4] transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning motion-reduce:transition-none"
              >
                <Square className="size-3.5 fill-current" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!canSend}
                aria-label="Enviar"
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg transition",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning",
                  "motion-reduce:transition-none",
                  canSend
                    ? "bg-warning text-[#14130F] hover:brightness-110"
                    : "cursor-not-allowed bg-white/[0.06] text-[#FBF9F4]/25"
                )}
              >
                <ArrowUp className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="mt-1.5 flex items-center justify-between gap-2">
            <p className="label-mono text-[#FBF9F4]/35">
              Enter envía · Shift+Enter salta de línea
            </p>
            {value.length > COUNTER_FROM && (
              <p
                className={cn(
                  "label-mono tabular-nums",
                  tooLong ? "text-destructive" : "text-[#FBF9F4]/50"
                )}
              >
                {value.length} / {MAX_MESSAGE_LENGTH}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
