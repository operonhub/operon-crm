import Link from "next/link"
import { cn } from "@/lib/utils"
import type { DashboardScope } from "@/lib/dashboard/queries"

const OPTIONS: { value: DashboardScope; label: string; href: string }[] = [
  { value: "team", label: "Todo el equipo", href: "/" },
  { value: "mine", label: "Mi trabajo", href: "/?scope=mine" },
]

/**
 * Control segmentado. Son enlaces, no botones: el filtro vive en la URL y el
 * panel se recalcula en el servidor, así que no hace falta JS en el cliente.
 */
export function ScopeToggle({ scope }: { scope: DashboardScope }) {
  return (
    <div
      role="group"
      aria-label="Alcance del panel"
      className="inline-flex shrink-0 rounded-lg bg-muted p-0.5"
    >
      {OPTIONS.map((option) => {
        const active = option.value === scope
        return (
          <Link
            key={option.value}
            href={option.href}
            aria-current={active ? "true" : undefined}
            className={cn(
              "rounded-[calc(var(--radius-lg)-2px)] px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </Link>
        )
      })}
    </div>
  )
}
