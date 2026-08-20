"use client"

import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { SlidersHorizontal } from "lucide-react"
import { updateProjectOperationalData } from "@/app/(app)/proyectos/actions"
import {
  PROJECT_AREAS,
  PROJECT_AREA_LABELS,
  PROJECT_ENGAGEMENT_LABELS,
  type ProjectArea,
  type ProjectEngagement,
} from "@/lib/constants"
import { Button } from "@/components/ui/button"
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

export function ProjectOperationalDialog({
  projectId,
  area,
  engagementKind,
  operationalType,
  clientId,
  clients,
}: {
  projectId: string
  area: ProjectArea
  engagementKind: ProjectEngagement
  operationalType: string | null
  clientId: string | null
  clients: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<ProjectEngagement>(engagementKind)
  const [state, action, pending] = useActionState(updateProjectOperationalData, null)
  const router = useRouter()

  useEffect(() => {
    if (state && "ok" in state && state.ok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false)
      router.refresh()
    }
  }, [state, router])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <SlidersHorizontal className="mr-1 h-4 w-4" />
        Organización
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Organización del proyecto</DialogTitle>
          <DialogDescription>Área general, modalidad y subtipo operativo.</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="project_id" value={projectId} />
          <div className="space-y-1.5">
            <Label>Área</Label>
            <Select name="area" defaultValue={area} items={PROJECT_AREA_LABELS}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROJECT_AREAS.map((value) => <SelectItem key={value} value={value}>{PROJECT_AREA_LABELS[value]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Modalidad</Label>
            <Select name="engagement_kind" value={kind} onValueChange={(value) => setKind(value as ProjectEngagement)} items={PROJECT_ENGAGEMENT_LABELS}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PROJECT_ENGAGEMENT_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {kind === "client" && (
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <Select name="client_id" defaultValue={clientId ?? undefined} required items={Object.fromEntries(clients.map((client) => [client.id, client.name]))}>
                <SelectTrigger><SelectValue placeholder="Elegí un cliente" /></SelectTrigger>
                <SelectContent>{clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="operational-type">Tipo / subtipo</Label>
            <Input id="operational-type" name="operational_type" defaultValue={operationalType ?? ""} placeholder="Ej: ecommerce, SaaS, WhatsApp, SEO" />
          </div>
          {state && "error" in state && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter><Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
