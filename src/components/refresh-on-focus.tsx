"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

/** Cuánto tiempo afuera hace falta para que valga la pena volver a pedir todo. */
const MIN_AWAY_MS = 60_000

/**
 * Sin Realtime: refresca al volver a la pestaña, pero sólo si estuviste afuera
 * un rato.
 *
 * Antes refrescaba cada vez que la ventana recuperaba el foco, con un tope de
 * 15 s. `router.refresh()` vuelve a correr todo el árbol del servidor de la
 * ruta —en Bandeja o Métricas, decenas de consultas—, así que ir a mirar algo a
 * otra ventana y volver a los 20 segundos recargaba la pantalla entera sin que
 * nada hubiera cambiado. Lo que importa es cuánto tiempo estuviste afuera, no
 * cuánto pasó desde el último refresco.
 */
export function RefreshOnFocus() {
  const router = useRouter()
  const awaySince = useRef<number | null>(null)

  useEffect(() => {
    function leave() {
      awaySince.current ??= Date.now()
    }

    function comeBack() {
      const since = awaySince.current
      awaySince.current = null
      if (since !== null && Date.now() - since >= MIN_AWAY_MS) router.refresh()
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") leave()
      else comeBack()
    }

    window.addEventListener("blur", leave)
    window.addEventListener("focus", comeBack)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener("blur", leave)
      window.removeEventListener("focus", comeBack)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [router])

  return null
}
