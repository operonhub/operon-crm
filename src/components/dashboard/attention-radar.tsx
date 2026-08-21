import Link from "next/link"
import { AlertTriangle, Check, ChevronRight, Clock, Hourglass } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { AlertSeverity, DashboardAlert } from "@/lib/dashboard/utils"
import { formatDate } from "@/lib/format"

/**
 * El color acompaña, no comunica solo: cada nivel trae además su propio icono
 * y una etiqueta de texto.
 */
const SEVERITY: Record<
  AlertSeverity,
  { icon: React.ElementType; label: string; className: string }
> = {
  critico: {
    icon: AlertTriangle,
    label: "Crítico",
    className: "text-destructive",
  },
  aviso: {
    icon: Clock,
    label: "Aviso",
    className: "text-amber-600 dark:text-amber-400",
  },
  espera: {
    icon: Hourglass,
    label: "En espera",
    className: "text-primary",
  },
}

export function AttentionRadar({ alerts }: { alerts: DashboardAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div
        id="atencion"
        className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground"
      >
        <Check className="h-4 w-4 text-success" aria-hidden="true" />
        Todo está bajo control.
      </div>
    )
  }

  return (
    <Card id="atencion" className="gap-0 overflow-hidden py-0" role="list">
      {alerts.map((alert, index) => {
        const { icon: Icon, label, className } = SEVERITY[alert.severity]
        return (
          <Link
            key={alert.id}
            href={alert.href}
            role="listitem"
            className={cn(
              "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 md:grid-cols-[auto_minmax(10rem,1.2fr)_minmax(10rem,1fr)_minmax(8rem,.7fr)_6rem_auto]",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
              index > 0 && "border-t"
            )}
          >
            <Icon
              className={cn("h-4 w-4 shrink-0", className)}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                <span className="sr-only">{label}: </span>
                {alert.title}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {alert.context}
              </p>
            </div>
            <div className="col-start-2 min-w-0 md:col-start-auto">
              <p className="label-mono text-muted-foreground md:hidden">Acción</p>
              <p className="truncate text-xs md:text-sm">
                {alert.action ?? alert.context}
              </p>
              {alert.company && (
                <p className="truncate text-xs text-muted-foreground md:hidden">
                  {alert.company}
                </p>
              )}
            </div>
            <div className="hidden min-w-0 md:block">
              <p className="truncate text-xs text-muted-foreground">
                {alert.company ?? "—"}
              </p>
              <p className="truncate text-xs">{alert.owner ?? "Sin asignar"}</p>
            </div>
            <time className="hidden font-mono text-xs text-muted-foreground tabular-nums md:block">
              {formatDate(alert.dueDate)}
            </time>
            <ChevronRight
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </Link>
        )
      })}
    </Card>
  )
}
