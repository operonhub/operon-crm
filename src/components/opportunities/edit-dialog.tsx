"use client"

import { useActionState, useEffect, useState } from "react"
import { Pencil } from "lucide-react"
import { useRouter } from "next/navigation"
import { updateOpportunity } from "@/app/(app)/oportunidades/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

type Opp = {
  id: string
  estimated_value: number | null
  probability: number | null
  next_action: string | null
  next_action_date: string | null
  expected_close_date: string | null
}

export function EditOpportunityDialog({ opp }: { opp: Opp }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(
    updateOpportunity,
    null as { ok?: boolean; error?: string } | null
  )
  const router = useRouter()

  useEffect(() => {
    if (state?.ok) {
      setOpen(false)
      router.refresh()
    }
  }, [state, router])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil className="mr-1 h-4 w-4" />
        Editar
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar oportunidad</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="opportunity_id" value={opp.id} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ev">Valor (USD)</Label>
              <Input
                id="ev"
                name="estimated_value"
                type="number"
                min="0"
                step="50"
                defaultValue={opp.estimated_value ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pr">Probabilidad (%)</Label>
              <Input
                id="pr"
                name="probability"
                type="number"
                min="0"
                max="100"
                defaultValue={opp.probability ?? ""}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="na">Próxima acción</Label>
            <Input
              id="na"
              name="next_action"
              defaultValue={opp.next_action ?? ""}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nad">Fecha próxima acción</Label>
              <Input
                id="nad"
                name="next_action_date"
                type="date"
                defaultValue={opp.next_action_date ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ecd">Cierre estimado</Label>
              <Input
                id="ecd"
                name="expected_close_date"
                type="date"
                defaultValue={opp.expected_close_date ?? ""}
              />
            </div>
          </div>
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
