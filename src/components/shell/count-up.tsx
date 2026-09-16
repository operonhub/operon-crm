"use client"

import { useEffect, useRef } from "react"

/**
 * Número que cuenta hacia arriba una vez, al entrar.
 *
 * Decisiones que importan:
 * - **El servidor renderiza el valor final.** Sin JavaScript, con movimiento
 *   reducido o antes de hidratar, se ve el número correcto; la animación es un
 *   agregado, nunca una condición para leer el dato. Y no hay desajuste de
 *   hidratación porque el primer render del cliente es idéntico.
 * - **No usa estado de React.** Escribe `textContent` directo en cada frame:
 *   contar no provoca un solo re-render.
 * - **Una sola vez por montaje.** Un `router.refresh()` conserva el nodo y no
 *   lo vuelve a disparar; sólo entrar a la pantalla de nuevo.
 * - `tabular-nums` en el contenedor evita que el ancho baile mientras cuenta.
 */
export type CountFormat =
  | { kind: "number"; decimals?: number }
  | { kind: "percent"; decimals?: number }
  | { kind: "money"; currency: "ARS" | "USD" }

const DURATION_MS = 900

function format(value: number, fmt: CountFormat): string {
  if (fmt.kind === "money") {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: fmt.currency,
      maximumFractionDigits: 0,
    }).format(value)
  }
  const decimals = fmt.decimals ?? 0
  const text = value.toLocaleString("es-AR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return fmt.kind === "percent" ? `${text}%` : text
}

export function CountUp({
  value,
  format: fmt = { kind: "number" },
  className,
}: {
  value: number
  format?: CountFormat
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node || value === 0) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS)
      // easeOutExpo: arranca rápido y se asienta suave sobre el valor real.
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
      node.textContent = format(value * eased, fmt)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      node.textContent = format(value, fmt)
    }
    // `fmt` se compara por valor: un objeto literal nuevo en cada render no
    // tiene que reiniciar la cuenta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, JSON.stringify(fmt)])

  return (
    <span ref={ref} className={className}>
      {format(value, fmt)}
    </span>
  )
}
