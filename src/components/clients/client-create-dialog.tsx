"use client"

import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, UsersRound } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/app/(app)/clientes/actions"
import type { ActionResult } from "@/lib/action-result"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type State = ActionResult<{ clientId: string }> | null

export function ClientCreateDialog({
  organizations,
  profiles,
}: {
  organizations: { id: string; name: string }[]
  profiles: { id: string; full_name: string }[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<State, FormData>(createClient, null)

  useEffect(() => {
    if (!state || !("ok" in state)) return
    toast.success(state.message ?? "Cliente creado")
    queueMicrotask(() => setOpen(false))
    if (state.data?.clientId) router.push(`/clientes/${state.data.clientId}`)
  }, [router, state])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}><Plus className="mr-1 size-4" />Nuevo cliente</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UsersRound className="size-5 text-primary" />Nuevo cliente</DialogTitle>
          <DialogDescription>Elegí una empresa existente o creá otra. Las coincidencias se confirman; nunca se fusionan solas.</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          {organizations.length > 0 && <div className="space-y-1.5"><Label>Empresa existente</Label><Select name="organization_id" items={Object.fromEntries(organizations.map((item) => [item.id, item.name]))}><SelectTrigger><SelectValue placeholder="Sin elegir" /></SelectTrigger><SelectContent>{organizations.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="client-company">O crear empresa</Label><Input id="client-company" name="organization_name" /></div>
            <div className="space-y-1.5"><Label htmlFor="client-web">Sitio web</Label><Input id="client-web" name="website" type="url" placeholder="https://" /></div>
            <div className="space-y-1.5"><Label htmlFor="client-industry">Rubro</Label><Input id="client-industry" name="industry" /></div>
            <div className="space-y-1.5"><Label htmlFor="client-city">Ciudad</Label><Input id="client-city" name="city" /></div>
            <div className="space-y-1.5"><Label htmlFor="client-country">País</Label><Input id="client-country" name="country" defaultValue="Argentina" /></div>
          </div>
          <div className="space-y-1.5"><Label>Responsable</Label><Select name="owner_id" items={Object.fromEntries(profiles.map((item) => [item.id, item.full_name]))}><SelectTrigger><SelectValue placeholder="Yo" /></SelectTrigger><SelectContent>{profiles.map((item) => <SelectItem key={item.id} value={item.id}>{item.full_name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="client-notes-full">Notas</Label><Textarea id="client-notes-full" name="notes" rows={3} /></div>
          {state && "error" in state && <div className="space-y-2"><p className="text-sm text-destructive">{state.error}</p>{state.fieldErrors?.duplicate_confirmed && <label className="flex items-center gap-2 text-sm"><Checkbox name="duplicate_confirmed" />Confirmo que es otra empresa</label>}</div>}
          <DialogFooter><Button type="submit" disabled={pending}>{pending ? "Creando…" : "Crear cliente"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
