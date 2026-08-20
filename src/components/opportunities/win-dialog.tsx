"use client"

import { useActionState, useState } from "react"
import { Trophy } from "lucide-react"
import { winOpportunity } from "@/app/(app)/proyectos/actions"
import {
  PROJECT_AREAS,
  PROJECT_AREA_LABELS,
  PROJECT_TEMPLATE_TYPES,
  SERVICE_TYPE_LABELS,
} from "@/lib/constants"
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
  const templateType =
    defaultType && PROJECT_TEMPLATE_TYPES.some((type) => type === defaultType)
      ? defaultType
      : "landing_page"

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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Área</Label>
              <Select name="project_area" defaultValue="sites_ecommerce" items={PROJECT_AREA_LABELS}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECT_AREAS.map((area) => (
                    <SelectItem key={area} value={area}>{PROJECT_AREA_LABELS[area]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Plantilla inicial</Label>
            <Select name="project_type" defaultValue={templateType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_TEMPLATE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{SERVICE_TYPE_LABELS[type]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-operational-type">Tipo / subtipo operativo</Label>
            <Input id="project-operational-type" name="operational_type" placeholder="Ej: ecommerce, CRM, WhatsApp" />
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
