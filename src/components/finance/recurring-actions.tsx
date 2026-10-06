"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CalendarClock, Pause, Play, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  deleteFinanceRecurringItem,
  generateDueRecurringRecords,
  generateFinanceRecurringRecord,
  setFinanceRecurringItemActive,
} from "@/app/(app)/finanzas/actions"
import type { ActionResult } from "@/lib/action-result"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

function useRun() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  function run(action: () => Promise<ActionResult | void>, success: string, after?: () => void) {
    startTransition(async () => {
      try {
        const result = await action()
        if (result && "error" in result) return void toast.error(result.error)
        toast.success((result && result.message) || success)
        after?.()
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo completar la acción.")
      }
    })
  }
  return { pending, run }
}

export function GenerateDueButton({ dueCount }: { dueCount: number }) {
  const { pending, run } = useRun()
  return <Button type="button" size="sm" variant={dueCount ? "default" : "outline"} disabled={pending || dueCount === 0} onClick={() => run(() => generateDueRecurringRecords(), "Vencimientos generados")}>
    <CalendarClock className="mr-1 size-4" />{pending ? "Generando…" : dueCount ? `Generar ${dueCount} vencido${dueCount === 1 ? "" : "s"}` : "Todo al día"}
  </Button>
}

export function RecurringRowActions({ id, concept, active, due }: { id: string; concept: string; active: boolean; due: boolean }) {
  const { pending, run } = useRun()
  const [confirmOpen, setConfirmOpen] = useState(false)
  return <div className="flex items-center justify-end gap-1">
    <Button type="button" size="xs" variant={due ? "default" : "outline"} disabled={pending || !active} onClick={() => run(() => {
      const fd = new FormData()
      fd.set("recurring_item_id", id)
      return generateFinanceRecurringRecord(fd)
    }, "Movimiento generado")}>Generar</Button>
    <Button type="button" size="icon-xs" variant="ghost" disabled={pending} aria-label={active ? `Pausar ${concept}` : `Reactivar ${concept}`} onClick={() => run(() => setFinanceRecurringItemActive(id, !active), active ? "Recurrente pausado." : "Recurrente reactivado.")}>
      {active ? <Pause className="size-4" /> : <Play className="size-4" />}
    </Button>
    <Button type="button" size="icon-xs" variant="ghost" disabled={pending} aria-label={`Eliminar ${concept}`} onClick={() => setConfirmOpen(true)}><Trash2 className="size-4 text-destructive" /></Button>
    <Dialog open={confirmOpen} onOpenChange={(open) => !pending && setConfirmOpen(open)}><DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>¿Eliminar “{concept}”?</DialogTitle><DialogDescription>Deja de generarse cada mes. Los movimientos que ya se generaron se conservan. Si solo querés frenarlo por un tiempo, pausalo.</DialogDescription></DialogHeader>
      <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={() => setConfirmOpen(false)}>Volver</Button><Button type="button" variant="destructive" disabled={pending} onClick={() => run(() => deleteFinanceRecurringItem(id), "Recurrente eliminado.", () => setConfirmOpen(false))}>Eliminar</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>
}
