"use client"

import { useActionState, useState } from "react"
import { Plus } from "lucide-react"
import {
  createOpportunity,
  type OpportunityFormState,
} from "@/app/(app)/oportunidades/actions"
import { SERVICE_TYPE_LABELS } from "@/lib/constants"
import { todayISO } from "@/lib/format"
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

type Profile = { id: string; full_name: string }
type Organization = { id: string; name: string }

const initialState: OpportunityFormState = { status: "idle" }

export function NewOpportunityDialog({
  profiles,
  organizations = [],
  showTrigger = true,
  open: controlledOpen,
  onOpenChange,
}: {
  profiles: Profile[]
  organizations?: Organization[]
  showTrigger?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  const [state, formAction, pending] = useActionState(
    createOpportunity,
    initialState
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {showTrigger && (
        <DialogTrigger render={<Button size="sm" />}>
          <Plus className="mr-1 h-4 w-4" />
          Nueva oportunidad
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva oportunidad</DialogTitle>
          <DialogDescription>
            Creá una oportunidad comercial y agregala a la etapa Nuevo.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="opportunity-title">Nombre de la oportunidad *</Label>
            <Input id="opportunity-title" name="title" required autoFocus />
          </div>

          {organizations.length > 0 && (
            <div className="space-y-1.5">
              <Label>Empresa existente</Label>
              <Select name="organization_id">
                <SelectTrigger><SelectValue placeholder="Sin elegir" /></SelectTrigger>
                <SelectContent>
                  {organizations.map((organization) => (
                    <SelectItem key={organization.id} value={organization.id}>
                      {organization.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="organization-name">O crear una empresa</Label>
            <Input id="organization-name" name="organization_name" placeholder="Nombre de la empresa" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo de servicio</Label>
              <Select name="service_type">
                <SelectTrigger>
                  <SelectValue placeholder="Sin definir" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SERVICE_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="estimated-value">Valor estimado</Label>
              <Input
                id="estimated-value"
                name="estimated_value"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Moneda</Label>
              <Select name="currency" defaultValue="USD" items={{ USD: "USD", ARS: "ARS" }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="ARS">ARS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Responsable</Label>
            <Select name="owner_id">
              <SelectTrigger>
                <SelectValue placeholder="Sin asignar" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="next-action">Próxima acción *</Label>
              <Input
                id="next-action"
                name="next_action"
                placeholder="Ej: contactar al cliente"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="next-action-date">Fecha *</Label>
              <Input
                id="next-action-date"
                name="next_action_date"
                type="date"
                defaultValue={todayISO()}
                required
              />
            </div>
          </div>

          {state.status === "error" && (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creando…" : "Crear oportunidad"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
