import Link from "next/link"
import {
  Building2,
  CheckSquare,
  CircleDollarSign,
  FolderKanban,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { formatMoney } from "@/lib/format"
import { ENTER_UP, stagger } from "@/lib/motion"
import { cn } from "@/lib/utils"
import type { DashboardSummary as Summary } from "@/lib/dashboard/queries"

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
      value: String(summary.activeProjects),
      caption: "En ejecución",
      icon: FolderKanban,
      href: "/proyectos",
      tone: "primary",
    },
    {
      key: "clientes",
      label: "Clientes activos",
      value: String(summary.activeClients),
      caption: "Con operación abierta",
      icon: Building2,
      href: "#clientes",
      tone: "default",
    },
    {
      key: "hoy",
      label: "Tareas para hoy",
      value: String(summary.tasksToday),
      caption: summary.needsAttention
        ? `${summary.needsAttention} requieren atención`
        : "Jornada despejada",
      icon: CheckSquare,
      href: "#tareas",
      tone: summary.needsAttention ? "warning" : "default",
    },
    {
      key: "cobros",
      label: "Cobros pendientes",
      value: formatMoney(summary.pendingReceivables.ARS, "ARS"),
      secondaryValue: formatMoney(summary.pendingReceivables.USD, "USD"),
      caption: "Monedas separadas",
      icon: CircleDollarSign,
      href: "/finanzas",
      tone: "default",
    },
  ] as const

  return (
    <section className="-mt-12 grid gap-3 px-4 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
      {stats.map((stat, index) => (
        <Link
          key={stat.key}
          href={stat.href}
          className="group relative z-20 rounded-xl outline-none"
        >
          <Card
            className={cn(
              ENTER_UP,
              "min-h-36 gap-0 border-0 bg-card py-4 shadow-lg shadow-foreground/[0.07] ring-1 transition-all group-hover:-translate-y-0.5 group-hover:shadow-xl group-focus-visible:ring-3 group-focus-visible:ring-ring/50 motion-reduce:group-hover:translate-y-0",
              stat.tone === "primary"
                ? "ring-primary/35"
                : stat.tone === "warning"
                  ? "ring-warning/55"
                  : "ring-foreground/10"
            )}
            style={stagger(index, 55)}
          >
            <CardContent className="flex h-full flex-col px-4">
              <div className="flex items-start justify-between gap-3">
                <p className="label-mono text-muted-foreground">{stat.label}</p>
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground",
                    stat.tone === "primary" && "bg-primary/12 text-primary",
                    stat.tone === "warning" &&
                      "bg-warning/25 text-warning-foreground"
                  )}
                >
                  <stat.icon className="size-4" aria-hidden="true" />
                </span>
              </div>
              <p className="mt-3 font-mono text-[clamp(1.45rem,3vw,2rem)] leading-none font-semibold tracking-tight tabular-nums">
                {stat.value}
              </p>
              {"secondaryValue" in stat && (
                <p className="mt-1 font-mono text-sm font-medium text-muted-foreground tabular-nums">
                  {stat.secondaryValue}
                </p>
              )}
              <p className="mt-auto pt-3 text-xs text-muted-foreground">
                {stat.caption}
              </p>
            </CardContent>
          </Card>
        </Link>
      ))}
      <p className="sr-only">Indicadores {scopeSuffix}.</p>
    </section>
  )
}
