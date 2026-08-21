"use client"

import { Dialog } from "@base-ui/react/dialog"
import { History, Maximize2, Minimize2, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { CAPABILITY_NOTE, connectionLabel } from "@/lib/assistant/ui"
import { useAssistant } from "./assistant-provider"
import { AssistantThread } from "./assistant-thread"
import { AssistantComposer } from "./assistant-composer"
import { AssistantDrawer } from "./assistant-drawer"
import { AssistantPreferences } from "./assistant-preferences"

/**
 * El panel de Operon IA.
 *
 * Superficie grafito en ambos temas, igual que el encabezado del panel de Hoy.
 * Por eso usa literales `#14130F` / `#FBF9F4` / `white/10` en lugar de tokens
 * semánticos: `bg-card` se volvería papel en tema claro y perdería la
 * identidad. Y como la capa base aplica `border-border` a todo, cada borde
 * visible necesita su `border-white/10` explícito.
 */

const TONE_DOT: Record<string, string> = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  muted: "bg-[#FBF9F4]/40",
}

export function AssistantPanel() {
  const {
    open,
    setOpen,
    expanded,
    toggleExpanded,
    status,
    configured,
    displayName,
    newSession,
    stop,
    drawerOpen,
    setDrawerOpen,
    conversations,
    view,
  } = useAssistant()

  const connection = connectionLabel({ configured, status })

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-black/40 transition-opacity duration-200",
            "supports-backdrop-filter:backdrop-blur-[3px]",
            "data-starting-style:opacity-0 data-ending-style:opacity-0",
            "motion-reduce:transition-none"
          )}
        />
        <Dialog.Popup
          onKeyDown={(event) => {
            // Escape tiene dos significados: primero detiene la respuesta,
            // recién después cierra. Si no, una respuesta larga es
            // imposible de frenar salvo perdiendo el panel.
            if (event.key === "Escape" && status === "streaming") {
              event.preventDefault()
              event.stopPropagation()
              stop()
            }
          }}
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden bg-[#14130F] text-[#FBF9F4]",
            "shadow-2xl shadow-black/50 ring-1 ring-white/10",
            "transition duration-200 ease-out",
            "data-starting-style:opacity-0 data-starting-style:scale-[0.985]",
            "data-ending-style:opacity-0 data-ending-style:scale-[0.985]",
            "motion-reduce:transition-none motion-reduce:scale-100",
            // Mobile: ocupa todo.
            "inset-0 rounded-none",
            // Desktop: anclado abajo a la derecha, o expandido.
            expanded
              ? "sm:inset-5 sm:rounded-2xl"
              : cn(
                  "sm:inset-auto sm:right-4 sm:bottom-4 sm:rounded-2xl",
                  "sm:h-[min(46rem,calc(100dvh-2rem))] sm:w-[min(30rem,calc(100vw-2rem))]",
                  "lg:right-6 lg:bottom-6"
                )
          )}
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
            <div className="min-w-0 flex-1">
              {/*
                El título del diálogo ES el encabezado visible, no uno oculto
                aparte. Con dos, un lector de pantalla anunciaba el nombre fijo
                ("Operon IA") mientras la pantalla mostraba el elegido
                ("JARVIS"), y quedaban dos h2 hermanos diciendo cosas
                distintas.
              */}
              <Dialog.Title
                render={
                  <h2 className="truncate font-heading text-sm font-semibold tracking-tight" />
                }
              >
                {displayName}
              </Dialog.Title>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 label-mono text-[#FBF9F4]/60">
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 rounded-full",
                    TONE_DOT[connection.tone] ?? TONE_DOT.muted
                  )}
                />
                {connection.text}
                <span aria-hidden="true">·</span>
                {CAPABILITY_NOTE}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setDrawerOpen(!drawerOpen)}
              aria-expanded={drawerOpen}
              aria-label="Conversaciones recientes"
              title="Conversaciones recientes"
              className="relative flex size-8 items-center justify-center rounded-lg text-[#FBF9F4]/60 transition-colors hover:bg-white/[0.08] hover:text-[#FBF9F4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning motion-reduce:transition-none"
            >
              <History className="size-4" aria-hidden="true" />
              {conversations.length > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-warning"
                />
              )}
            </button>

            <button
              type="button"
              onClick={newSession}
              aria-label="Nueva sesión"
              title="Nueva sesión"
              className="flex size-8 items-center justify-center rounded-lg text-[#FBF9F4]/60 transition-colors hover:bg-white/[0.08] hover:text-[#FBF9F4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning motion-reduce:transition-none"
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={toggleExpanded}
              aria-label={expanded ? "Contraer panel" : "Expandir panel"}
              title={expanded ? "Contraer" : "Expandir"}
              className="hidden size-8 items-center justify-center rounded-lg text-[#FBF9F4]/60 transition-colors hover:bg-white/[0.08] hover:text-[#FBF9F4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning motion-reduce:transition-none sm:flex"
            >
              {expanded ? (
                <Minimize2 className="size-4" aria-hidden="true" />
              ) : (
                <Maximize2 className="size-4" aria-hidden="true" />
              )}
            </button>

            <Dialog.Close
              aria-label="Cerrar"
              className="flex size-8 items-center justify-center rounded-lg text-[#FBF9F4]/60 transition-colors hover:bg-white/[0.08] hover:text-[#FBF9F4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning motion-reduce:transition-none"
            >
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </header>

          {view === "preferences" ? (
            <AssistantPreferences />
          ) : (
            <>
              <AssistantThread />
              <AssistantComposer />
            </>
          )}
          <AssistantDrawer />

          {/*
            Anuncia sólo transiciones de estado. Poner aria-live en el texto
            que llega haría que un lector de pantalla lea cada palabra suelta.
          */}
          <p role="status" aria-live="polite" className="sr-only">
            {status === "streaming"
              ? "Respondiendo"
              : status === "error"
                ? "No se pudo responder"
                : ""}
          </p>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
