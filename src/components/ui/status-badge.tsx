import { cn } from "@/lib/utils"

/**
 * Badge de estado con la paleta de marca.
 *
 * Reemplaza los colores genéricos de Tailwind (sky, violet, amber, slate…) que
 * usaban `lead-badges`, `project-badges` y `stage-badge`, y que no tenían nada
 * que ver con papel, tinta, azul y sol.
 *
 * El color va en el punto y en el fondo teñido; el texto queda en tinta. Es a
 * propósito: un texto de 10 px en `success` o en sol sobre fondo claro no pasa
 * contraste, y un badge que no se lee no informa nada.
 */
export type StatusTone = "neutral" | "info" | "primary" | "deep" | "success" | "warning" | "danger"

const TONE: Record<StatusTone, { badge: string; dot: string }> = {
  neutral: { badge: "bg-muted border-border", dot: "bg-muted-foreground/60" },
  info: { badge: "bg-accent border-primary/15", dot: "bg-primary/70" },
  primary: { badge: "bg-primary/10 border-primary/25", dot: "bg-primary" },
  deep: { badge: "bg-chart-4/12 border-chart-4/25", dot: "bg-chart-4" },
  success: { badge: "bg-success/12 border-success/30", dot: "bg-success" },
  warning: { badge: "bg-warning/25 border-warning/55", dot: "bg-warning" },
  danger: { badge: "bg-destructive/10 border-destructive/30", dot: "bg-destructive" },
}

export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: StatusTone
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center gap-1.5 rounded-full border px-2 font-mono text-[10px] font-medium tracking-wide whitespace-nowrap text-foreground/85 uppercase",
        TONE[tone].badge,
        className
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", TONE[tone].dot)} />
      {children}
    </span>
  )
}
