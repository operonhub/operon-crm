import { ViewTransition } from "react"
import Link from "next/link"
import { TabPending } from "@/components/shell/tab-pending"
import { cn } from "@/lib/utils"

/**
 * Pestañas cuyo estado vive en la URL.
 *
 * Reemplaza las tres implementaciones que había (`TabLink` en Redes y Bandeja,
 * `pipeline-tabs.tsx`). Por URL y no por estado de React, como ya era el
 * criterio del repo: una pestaña se comparte por link y "atrás" hace lo que uno
 * espera.
 *
 * Movimiento:
 * - Al tocar, la pestaña marca "cargando" en el acto (`TabPending`).
 * - Cuando llega el contenido, el fondo de la activa se desliza desde la
 *   anterior: las dos comparten `name`, así que React las trata como el mismo
 *   elemento que cambió de lugar. `share` + `default="none"` hacen que sólo se
 *   mueva cuando cambia de pestaña y no ante cualquier otra transición.
 */
export type UrlTab = {
  value: string
  label: React.ReactNode
  href: string
  icon?: React.ReactNode
  count?: number
}

export function UrlTabs({
  id,
  tabs,
  active,
  className,
  size = "md",
}: {
  /** Identifica el grupo: dos grupos de pestañas en la misma pantalla no pueden compartir indicador. */
  id: string
  tabs: UrlTab[]
  active: string
  className?: string
  size?: "sm" | "md"
}) {
  return (
    <nav
      aria-label="Secciones"
      className={cn(
        "flex w-full gap-1 overflow-x-auto rounded-xl border bg-card p-1 shadow-sm sm:w-fit",
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.value === active
        return (
          <Link
            key={tab.value}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative inline-flex min-w-max items-center gap-2 rounded-lg font-medium outline-none transition-colors duration-150",
              "focus-visible:ring-3 focus-visible:ring-ring/50",
              size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm",
              isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {isActive && (
              <ViewTransition name={`tabs-${id}`} share="tab-indicator" default="none">
                <span
                  aria-hidden="true"
                  className="absolute inset-0 z-0 rounded-lg bg-primary shadow-sm"
                />
              </ViewTransition>
            )}
            <span className="relative z-10 inline-flex items-center gap-2">
              {tab.icon}
              {tab.label}
              {typeof tab.count === "number" && (
                <span
                  className={cn(
                    "label-mono tabular-nums",
                    isActive ? "text-primary-foreground/75" : "text-muted-foreground/70"
                  )}
                >
                  {tab.count}
                </span>
              )}
            </span>
            {!isActive && <TabPending />}
          </Link>
        )
      })}
    </nav>
  )
}
