"use client"

import { useActionState, useState } from "react"
import { Trophy } from "lucide-react"
import { winOpportunity } from "@/app/(app)/proyectos/actions"
import { SERVICE_TYPE_LABELS } from "@/lib/constants"
import type { Enums } from "@/lib/supabase/types"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function WinDialog({
  opportunityId,
  defaultName,
  defaultType,
}: {
  opportunityId: string
  defaultName: string
  defaultType: Enums<"service_type"> | null
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(
    winOpportunity,
    null as { error: string } | null
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Trophy className="mr-1 h-4 w-4" />
        Marcar ganada
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar como ganada</DialogTitle>
          <DialogDescription>
            Se crea el cliente y un proyecto con su checklist inicial según el
            tipo de servicio.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="opportunity_id" value={opportunityId} />
          <div className="space-y-1.5">
            <Label htmlFor="pn">Nombre del proyecto *</Label>
            <Input
              id="pn"
              name="project_name"
              defaultValue={defaultName}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de proyecto</Label>
            <Select name="project_type" defaultValue={defaultType ?? "landing_page"}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SERVICE_TYPE_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creando…" : "Crear cliente y proyecto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
