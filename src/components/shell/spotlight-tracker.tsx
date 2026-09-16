"use client"

import { useEffect } from "react"

/**
 * Brillo que sigue al cursor sobre las tarjetas con clase `spotlight`.
 *
 * Un solo listener para toda la app, montado en el layout, en vez de un
 * componente cliente por tarjeta: las tarjetas siguen siendo HTML del servidor y
 * sumar el efecto a una nueva es agregar una clase.
 *
 * Costo, que es lo que importa en una pantalla que se usa todo el día:
 * - Como mucho una escritura por frame (`requestAnimationFrame`), y sólo
 *   mientras el cursor está sobre una tarjeta.
 * - Escribe dos custom properties registradas con `inherits: false`
 *   (`globals.css`), así el cambio no recalcula el estilo de todo lo que hay
 *   dentro de la tarjeta; sólo el pseudo-elemento que pinta el brillo.
 * - No se monta en pantallas táctiles ni con movimiento reducido.
 */
export function SpotlightTracker() {
  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)")
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (!fine.matches || reduced.matches) return

    let frame = 0
    let last: PointerEvent | null = null

    const paint = () => {
      frame = 0
      if (!last) return
      const target = last.target instanceof Element ? last.target.closest<HTMLElement>(".spotlight") : null
      if (!target) return
      const rect = target.getBoundingClientRect()
      target.style.setProperty("--spot-x", `${last.clientX - rect.left}px`)
      target.style.setProperty("--spot-y", `${last.clientY - rect.top}px`)
    }

    const onMove = (event: PointerEvent) => {
      last = event
      if (!frame) frame = requestAnimationFrame(paint)
    }

    document.addEventListener("pointermove", onMove, { passive: true })
    return () => {
      document.removeEventListener("pointermove", onMove)
      cancelAnimationFrame(frame)
    }
  }, [])

  return null
}
