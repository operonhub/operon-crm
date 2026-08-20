import Link from "next/link"
import { Building2, CheckSquare, CircleDollarSign, FolderKanban } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { DashboardSummary as Summary } from "@/lib/dashboard/queries"
import { formatMoney } from "@/lib/format"

/**
 * Cuatro indicadores operativos en una sola tarjeta dividida, en vez de cuatro
 * tarjetas sueltas del mismo peso. Nada de leads, pipeline ni conversión: eso
 * vive en Pipeline y Métricas.
 */
export function DashboardSummary({
  summary,
  scopeSuffix,
}: {
  summary: Summary
  scopeSuffix: string
}) {
  const stats = [
    {
      key: "proyectos",
      label: "Proyectos activos",
      value: summary.activeProjects,
      icon: FolderKanban,
      href: "/proyectos",
    },
    {
      key: "clientes",
      label: "Clientes activos",
      value: summary.activeClients,
      icon: Building2,
      href: "#clientes",
    },
    {
      key: "hoy",
      label: "Tareas para hoy",
      value: summary.tasksToday,
      icon: CheckSquare,
      href: "#tareas",
    },
    {
      key: "cobros",
      label: "Cobros pendientes",
      value: (
        <span className="flex flex-col gap-0.5 text-sm leading-tight">
          <span>{formatMoney(summary.pendingReceivables.ARS, "ARS")}</span>
          <span>{formatMoney(summary.pendingReceivables.USD, "USD")}</span>
        </span>
      ),
      icon: CircleDollarSign,
      href: "/finanzas",
    },
  ]

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="grid grid-cols-2 sm:grid-cols-4">
        {stats.map((stat, index) => {
          const content = (
            <>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <stat.icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="text-xs">{stat.label}</span>
              </div>
              <p
                className={cn(
                  "mt-1.5 font-mono text-2xl leading-none font-semibold tabular-nums",
                )}
              >
                {stat.value}
              </p>
            </>
          )

          const className = cn(
            "p-4 transition-colors",
            // Separadores sin encerrar cada celda en su propio borde.
            index % 2 === 1 && "border-l",
            index >= 2 && "border-t sm:border-t-0",
            index >= 1 && "sm:border-l",
            stat.href && "hover:bg-muted/50"
          )

          return stat.href ? (
            <Link
              key={stat.key}
              href={stat.href}
              className={cn(
                className,
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              )}
            >
              {content}
            </Link>
          ) : (
            <div key={stat.key} className={className}>
              {content}
            </div>
          )
        })}
      </div>
      <p className="sr-only">Indicadores {scopeSuffix}.</p>
    </Card>
  )
}
