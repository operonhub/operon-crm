"use client"

import { useCallback, useEffect, useRef, useTransition } from "react"
import { toast } from "sonner"
import { syncSocialContentIfStale } from "@/app/(app)/redes/actions"

/**
 * Mantiene Redes al día mientras está abierta, pero el servidor es quien aplica
 * el enfriamiento compartido. Así dos pestañas no convierten cada foco en una
 * nueva ronda contra Zernio.
 */
export function AutoSocialContentSync({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition()
  const running = useRef(false)

  const sync = useCallback(() => {
    if (!enabled || running.current) return
    running.current = true
    startTransition(async () => {
      try {
        const result = await syncSocialContentIfStale()
        if ("error" in result) toast.error(result.error)
      } finally {
        running.current = false
      }
    })
  }, [enabled])

  useEffect(() => {
    sync()
    const interval = window.setInterval(sync, 10 * 60_000)
    return () => window.clearInterval(interval)
  }, [sync])

  return pending ? <span className="label-mono text-muted-foreground">actualizando Instagram…</span> : null
}
