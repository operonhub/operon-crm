import { cn } from "@/lib/utils"

/**
 * Serie temporal mínima, en SVG a mano.
 *
 * Sin librería de gráficos a propósito: el repo no tiene ninguna y traer 200 kB
 * de JavaScript para dibujar una línea de siete puntos no se justifica. Los
 * tokens `--chart-1..5` ya estaban definidos en `globals.css` sin usar.
 *
 * El SVG escala con `preserveAspectRatio="none"`, así que el ancho lo pone el
 * contenedor y no hace falta medir nada del lado del cliente — puede vivir en
 * un server component.
 */

export type SparkPoint = { label: string; value: number }

export function Sparkline({
  points,
  className,
  emptyLabel = "Todavía no hay suficientes días para dibujar una evolución.",
}: {
  points: SparkPoint[]
  className?: string
  emptyLabel?: string
}) {
  // Con un solo punto no hay línea que trazar. Decirlo es más honesto que
  // dibujar una recta plana que se leería como "no cambió nada".
  if (points.length < 2) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">{emptyLabel}</p>
    )
  }

  const values = points.map((p) => p.value)
  const max = Math.max(...values)
  const min = Math.min(...values)
  // Si todos los valores son iguales, el rango es 0 y dividir explotaría.
  const range = max - min || 1

  const W = 100
  const H = 32
  const coords = points.map((point, index) => {
    const x = (index / (points.length - 1)) * W
    const y = H - ((point.value - min) / range) * H
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  const linea = `M ${coords.join(" L ")}`
  const area = `${linea} L ${W},${H} L 0,${H} Z`
  const primero = points[0]
  const ultimo = points[points.length - 1]

  const ultimoY = ((ultimo.value - min) / range) * 100

  return (
    <figure className={cn("space-y-1", className)}>
      {/*
        La línea se revela de izquierda a derecha con clip-path. No con
        stroke-dasharray + pathLength: combinado con vector-effect
        non-scaling-stroke, Chrome calcula los guiones en píxeles de pantalla y
        la línea queda cortada en pedazos.
      */}
      <div className="relative h-16 w-full">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="chart-reveal absolute inset-0 size-full overflow-visible"
          role="img"
          aria-label={`De ${primero.value} el ${primero.label} a ${ultimo.value} el ${ultimo.label}`}
        >
          <path d={area} fill="var(--chart-1)" opacity="0.12" />
          <path
            d={linea}
            fill="none"
            stroke="var(--chart-1)"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {/* El punto va en HTML: dentro de un SVG estirado sería un óvalo. */}
        <span
          aria-hidden="true"
          className="animate-in fade-in zoom-in-50 absolute right-0 size-2 translate-x-1/2 translate-y-1/2 rounded-full bg-[var(--chart-1)] ring-2 ring-card delay-700 duration-300 fill-mode-both"
          style={{ bottom: `${ultimoY}%` }}
        />
      </div>
      <figcaption className="label-mono flex justify-between text-muted-foreground">
        <span>{primero.label}</span>
        <span>{ultimo.label}</span>
      </figcaption>
    </figure>
  )
}

/**
 * Barra de proporción, con el mismo lenguaje visual que `Distribution` en
 * Métricas: fondo neutro, relleno de acento, todo con divs.
 */
export function MeterRow({
  label,
  value,
  max,
  hint,
}: {
  label: string
  value: number
  max: number
  hint?: string
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {hint ?? value.toLocaleString("es-AR")}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="chart-grow-x h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
