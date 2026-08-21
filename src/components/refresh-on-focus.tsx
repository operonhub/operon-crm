"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

const MIN_REFRESH_INTERVAL_MS = 15_000

/** Sin Realtime: refresca al volver a la pestaña, con throttle. */
export function RefreshOnFocus() {
  const router = useRouter()
  const lastRefresh = useRef(0)

  useEffect(() => {
    lastRefresh.current = Date.now()
    function refresh() {
      const now = Date.now()
      if (now - lastRefresh.current < MIN_REFRESH_INTERVAL_MS) return
      lastRefresh.current = now
      router.refresh()
    }
    function onVisibility() {
      if (document.visibilityState === "visible") refresh()
    }
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [router])

  return null
}
