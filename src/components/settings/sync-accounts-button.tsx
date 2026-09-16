"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { syncZernioAccounts } from "@/app/(app)/ajustes/conexiones/actions"
import { Button } from "@/components/ui/button"

/**
 * Único botón de la pantalla que sale a internet.
 *
 * Mismo patrón que el resto del CRM: `useTransition` para el estado de carga,
 * `toast` para el resultado y `router.refresh()` para que el server component
 * vuelva a leer de Supabase — no se toca estado local, la verdad está en la base.
 */
export function SyncAccountsButton({ disabled }: { disabled?: boolean }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function handleClick() {
    startTransition(async () => {
      const result = await syncZernioAccounts()
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? "Cuentas sincronizadas.")
      router.refresh()
    })
  }

  return (
    <Button size="sm" onClick={handleClick} disabled={pending || disabled}>
      <RefreshCw
        className={pending ? "mr-2 size-4 animate-spin" : "mr-2 size-4"}
        aria-hidden="true"
      />
      {pending ? "Sincronizando…" : "Sincronizar cuentas"}
    </Button>
  )
}
