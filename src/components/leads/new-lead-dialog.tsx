"use client"

import { useRef, useState, useActionState, useEffect } from "react"
import { Plus, AlertTriangle } from "lucide-react"
import { createLead, type LeadFormState } from "@/app/(app)/leads/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
import { LEAD_SOURCE_LABELS, SERVICE_TYPE_LABELS } from "@/lib/constants"

type Profile = { id: string; full_name: string }

const initial: LeadFormState = { status: "idle" }

export function NewLeadDialog({ profiles }: { profiles: Profile[] }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(createLead, initial)
  const formRef = useRef<HTMLFormElement>(null)
  const forceRef = useRef<HTMLInputElement>(null)

  // Al cerrar, reseteamos el flag force para el próximo alta.
  useEffect(() => {
    if (!open && forceRef.current) forceRef.current.value = "false"
  }, [open])

  const hasDuplicates = state.status === "duplicates"

  function submitAnyway() {
    if (forceRef.current) forceRef.current.value = "true"
    formRef.current?.requestSubmit()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="mr-1 h-4 w-4" />
        Nuevo lead
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo lead</DialogTitle>
          <DialogDescription>
            Cargá la empresa y, opcionalmente, un contacto. Si hay un posible
            duplicado te lo vamos a avisar.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} action={formAction} className="space-y-4">
          <input ref={forceRef} type="hidden" name="force" defaultValue="false" />

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase text-muted-foreground">
              Empresa
            </legend>
            <div className="space-y-1.5">
              <Label htmlFor="org_name">Nombre *</Label>
              <Input id="org_name" name="org_name" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="org_website">Web</Label>
                <Input id="org_website" name="org_website" placeholder="empresa.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="segment">Segmento / ICP</Label>
                <Input id="segment" name="segment" />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase text-muted-foreground">
              Contacto (opcional)
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="contact_name">Nombre</Label>
                <Input id="contact_name" name="contact_name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact_phone">Teléfono</Label>
                <Input id="contact_phone" name="contact_phone" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact_email">Email</Label>
              <Input id="contact_email" name="contact_email" type="email" />
            </div>
          </fieldset>

          <fieldset className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fuente</Label>
              <Select name="source" defaultValue="lista_manual">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LEAD_SOURCE_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Servicio de interés</Label>
              <Select name="service_interest">
                <SelectTrigger>
                  <SelectValue placeholder="—" />
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
          </fieldset>

          <div className="space-y-1.5">
            <Label>Responsable</Label>
            <Select name="owner_id">
              <SelectTrigger>
                <SelectValue placeholder="Sin asignar" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>

          {state.status === "error" && (
            <p className="text-sm text-destructive">{state.message}</p>
          )}

          {hasDuplicates && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
              <div className="mb-2 flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" />
                Posibles duplicados
              </div>
              <ul className="space-y-1 text-amber-900 dark:text-amber-200">
                {state.duplicates.map((d, i) => (
                  <li key={i}>
                    <span className="font-medium">{d.label}</span> — {d.detail}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                Revisá si ya existe. Podés crearlo igual (no se fusiona nada
                automáticamente).
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            {hasDuplicates ? (
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={submitAnyway}
              >
                Crear igual
              </Button>
            ) : (
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Crear lead"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
