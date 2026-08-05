"use client"

import { useActionState, useState } from "react"
import { ArrowRightLeft } from "lucide-react"
import { convertLeadToOpportunity } from "@/app/(app)/leads/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { todayISO } from "@/lib/format"

export function ConvertLeadDialog({
  leadId,
  defaultTitle,
}: {
  leadId: string
  defaultTitle: string
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(
    convertLeadToOpportunity,
    null as { error: string } | null
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <ArrowRightLeft className="mr-1 h-4 w-4" />
        Convertir en oportunidad
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convertir en oportunidad</DialogTitle>
          <DialogDescription>
            Toda oportunidad activa necesita una próxima acción con fecha.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="lead_id" value={leadId} />
          <div className="space-y-1.5">
            <Label htmlFor="title">Título *</Label>
            <Input id="title" name="title" defaultValue={defaultTitle} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="estimated_value">Valor estimado (USD)</Label>
            <Input
              id="estimated_value"
              name="estimated_value"
              type="number"
              min="0"
              step="50"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="next_action">Próxima acción *</Label>
              <Input
                id="next_action"
                name="next_action"
                placeholder="Ej: agendar llamada"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="next_action_date">Fecha *</Label>
              <Input
                id="next_action_date"
                name="next_action_date"
                type="date"
                defaultValue={todayISO()}
                required
              />
            </div>
          </div>
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Convirtiendo…" : "Crear oportunidad"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
