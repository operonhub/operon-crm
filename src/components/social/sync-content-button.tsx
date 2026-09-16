"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { syncSocialContent } from "@/app/(app)/redes/actions"
import { Button } from "@/components/ui/button"

/**
 * Dispara la sincronización de contenido.
 *
 * Tarda bastante más que la de cuentas —recorre publicaciones, métricas,
 * historias y seguidores—, así que el botón se bloquea mientras corre en vez de
 * permitir que alguien la dispare tres veces seguidas.
 */
export function SyncContentButton() {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function handleClick() {
    startTransition(async () => {
      const result = await syncSocialContent()
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? "Contenido sincronizado.")
      router.refresh()
    })
  }

  return (
    <Button onClick={handleClick} disabled={pending}>
      <RefreshCw
        className={pending ? "mr-2 size-4 animate-spin" : "mr-2 size-4"}
        aria-hidden="true"
      />
      {pending ? "Sincronizando…" : "Sincronizar contenido"}
    </Button>
  )
}
