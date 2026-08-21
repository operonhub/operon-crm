"use client"

import { useActionState, useEffect, useState } from "react"
import { Pencil } from "lucide-react"
import { useRouter } from "next/navigation"
import { updateOpportunity } from "@/app/(app)/oportunidades/actions"
import type { ActionResult } from "@/lib/action-result"
import { SERVICE_TYPE_LABELS, SUPPORTED_CURRENCIES } from "@/lib/constants"
import type { Enums } from "@/lib/supabase/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
  title: string
  stage: Enums<"opportunity_stage">
  service_type: Enums<"service_type"> | null
  currency: string
  owner_id: string | null
  organization_id: string | null
  estimated_value: number | null
  probability: number | null
  next_action: string | null
  next_action_date: string | null
  expected_close_date: string | null
}

export function EditOpportunityDialog({ opp, profiles, organizations }: { opp: Opp; profiles: { id: string; full_name: string }[]; organizations: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    updateOpportunity,
    null
  )
  const router = useRouter()

  useEffect(() => {
    if (state && "ok" in state) {
      queueMicrotask(() => setOpen(false))
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
          <input type="hidden" name="stage" value={opp.stage} />
          <div className="space-y-1.5"><Label htmlFor="opp-title">Nombre</Label><Input id="opp-title" name="title" required defaultValue={opp.title} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Empresa</Label><Select name="organization_id" defaultValue={opp.organization_id ?? undefined} items={Object.fromEntries(organizations.map((item) => [item.id, item.name]))}><SelectTrigger><SelectValue placeholder="Sin empresa" /></SelectTrigger><SelectContent>{organizations.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Responsable</Label><Select name="owner_id" defaultValue={opp.owner_id ?? undefined} items={Object.fromEntries(profiles.map((item) => [item.id, item.full_name]))}><SelectTrigger><SelectValue placeholder="Sin responsable" /></SelectTrigger><SelectContent>{profiles.map((item) => <SelectItem key={item.id} value={item.id}>{item.full_name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Servicio</Label><Select name="service_type" defaultValue={opp.service_type ?? undefined} items={SERVICE_TYPE_LABELS}><SelectTrigger><SelectValue placeholder="Sin definir" /></SelectTrigger><SelectContent>{Object.entries(SERVICE_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Moneda</Label><Select name="currency" defaultValue={opp.currency}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SUPPORTED_CURRENCIES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ev">Valor estimado</Label>
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
          {state && "error" in state && (
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
