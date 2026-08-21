"use client"

import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Bot, Plus } from "lucide-react"
import { toast } from "sonner"
import { createAgent } from "@/app/(app)/agentes/actions"
import type { ActionResult } from "@/lib/action-result"
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
import { Textarea } from "@/components/ui/textarea"

type State = ActionResult<{ agentId: string }> | null

export function AgentCreateDialog({
  profiles,
  isAdmin,
}: {
  profiles: { id: string; full_name: string }[]
  isAdmin: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<State, FormData>(createAgent, null)

  useEffect(() => {
    if (!state || !("ok" in state)) return
    toast.success(state.message ?? "Agente creado")
    queueMicrotask(() => setOpen(false))
    if (state.data?.agentId) router.push(`/agentes/${state.data.agentId}`)
  }, [router, state])

  if (!isAdmin) return null
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="mr-1 size-4" /> Nuevo agente
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="size-5 text-primary" /> Nuevo agente
          </DialogTitle>
          <DialogDescription>
            Se crea en borrador. Esto configura un catálogo, no ejecuta un runner.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="agent-name">Nombre</Label>
            <Input id="agent-name" name="name" required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-purpose">Propósito</Label>
            <Textarea id="agent-purpose" name="purpose" required rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-description">Descripción corta</Label>
            <Input id="agent-description" name="description" />
          </div>
          <div className="space-y-1.5">
            <Label>Responsable</Label>
            <Select name="owner_id" items={Object.fromEntries(profiles.map((profile) => [profile.id, profile.full_name]))}>
              <SelectTrigger><SelectValue placeholder="Yo" /></SelectTrigger>
              <SelectContent>{profiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {state && "error" in state && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>{pending ? "Creando…" : "Crear borrador"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
