"use client"

import { cn } from "@/lib/utils"
import { OperonMarkPapel } from "@/components/brand/operon-mark"
import { useAssistant } from "./assistant-provider"

/**
 * Botón flotante. Se oculta mientras el panel está abierto para no quedar
 * debajo del backdrop.
 */
export function AssistantLauncher() {
  const { open, setOpen, status, configured } = useAssistant()

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Abrir Operon IA"
      aria-haspopup="dialog"
      aria-expanded={open}
      className={cn(
        "group fixed right-4 bottom-4 z-40 flex size-12 items-center justify-center",
        "rounded-full bg-[#14130F] text-[#FBF9F4] shadow-lg shadow-black/25",
        "ring-1 ring-warning/30 transition duration-200",
        "hover:ring-warning/70 hover:shadow-xl focus-visible:outline-2",
        "focus-visible:outline-offset-2 focus-visible:outline-warning",
        "motion-reduce:transition-none",
        "mb-[env(safe-area-inset-bottom)] lg:right-6 lg:bottom-6",
        open && "pointer-events-none scale-90 opacity-0"
      )}
    >
      <OperonMarkPapel className="h-6 w-[17px] transition-transform duration-200 group-hover:scale-110 motion-reduce:transition-none" />
      {/* Punto de estado: sólo aparece cuando hay algo que decir. */}
      {(status === "streaming" || !configured) && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-1 right-1 size-2.5 rounded-full ring-2 ring-[#14130F]",
            status === "streaming"
              ? "animate-pulse bg-success motion-reduce:animate-none"
              : "bg-warning"
          )}
        />
      )}
    </button>
  )
}
