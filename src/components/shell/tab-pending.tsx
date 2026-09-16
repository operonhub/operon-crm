"use client"

import { useLinkStatus } from "next/link"
import { cn } from "@/lib/utils"

/**
 * Señal inmediata de "tocaste esta pestaña".
 *
 * Cambiar sólo los parámetros de la URL mantiene la pantalla vieja hasta que
 * llega la nueva (verificado con Playwright): sin esto, durante esa espera no
 * hay ninguna respuesta visual y parece que el click no anduvo.
 *
 * Tiene que vivir DENTRO del `<Link>`: `useLinkStatus` lee el estado del link
 * ancestro más cercano.
 */
export function TabPending() {
  const { pending } = useLinkStatus()
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-x-3 bottom-1 h-0.5 origin-left scale-x-0 rounded-full bg-primary/60 opacity-0 transition-[scale,opacity] duration-500 motion-reduce:transition-none",
        pending && "scale-x-100 opacity-100"
      )}
    />
  )
}
