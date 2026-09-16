import Link from "next/link"
import { CountUp, type CountFormat } from "@/components/shell/count-up"
import { ENTER_UP, LIFT, stagger } from "@/lib/motion"
import { cn } from "@/lib/utils"

/**
 * Tarjeta de indicador. Reemplaza `Kpi` (Redes), `MetricCard` (Métricas) y
 * `MetricCard` (Agentes), con el lenguaje de los KPI de *Hoy*: anillo, sombra,
 * entrada escalonada, brillo que sigue al cursor (`SpotlightTracker`) y
 * elevación al pasar el mouse si es clickeable.
 *
 * `value` numérico + `format` cuenta hacia arriba; `display` (texto ya
 * formateado) se muestra tal cual, para los casos que no tiene sentido animar
 * —dos monedas juntas, un "—" sin datos—.
 */
export type KpiTone = "default" | "primary" | "success" | "warning" | "danger"

const RING: Record<KpiTone, string> = {
  default: "ring-foreground/10",
  primary: "ring-primary/35",
  success: "ring-success/40",
  warning: "ring-warning/60",
  danger: "ring-destructive/40",
}

const ICON_TILE: Record<KpiTone, string> = {
  default: "bg-muted text-muted-foreground",
  primary: "bg-primary/12 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/30 text-foreground",
  danger: "bg-destructive/12 text-destructive",
}

export function KpiCard({
  label,
  value,
  format,
  display,
  hint,
  icon,
  tone = "default",
  href,
  index = 0,
  className,
}: {
  label: string
  value?: number | null
  format?: CountFormat
  display?: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ReactNode
  tone?: KpiTone
  href?: string
  /** Posición en el grupo, para la entrada en cascada. */
  index?: number
  className?: string
}) {
  const body = (
    <div
      className={cn(
        ENTER_UP,
        "spotlight flex h-full min-h-28 flex-col rounded-xl bg-card p-4 shadow-md shadow-foreground/[0.05] ring-1",
        tone === "danger" && "spotlight-danger",
        RING[tone],
        href && cn(LIFT, "group-focus-visible:ring-3 group-focus-visible:ring-ring/50"),
        className
      )}
      style={stagger(index, 55)}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="label-mono text-muted-foreground">{label}</p>
        {icon && (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
              ICON_TILE[tone]
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 font-mono text-[clamp(1.4rem,2.6vw,1.9rem)] leading-none font-semibold tracking-tight tabular-nums">
        {display !== undefined ? (
          display
        ) : typeof value === "number" ? (
          <CountUp value={value} format={format} />
        ) : (
          "—"
        )}
      </p>
      {hint && <p className="mt-auto pt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )

  if (!href) return body
  return (
    <Link href={href} className="group block rounded-xl outline-none">
      {body}
    </Link>
  )
}
