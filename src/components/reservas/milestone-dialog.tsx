"use client"

import { useActionState, useId, useState } from "react"
import { recordReservasMilestone } from "@/app/(app)/reservas-prospectos/actions"
import type { ActionResult } from "@/lib/action-result"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog"

const EVENTS = {
  meeting_scheduled: "Reunión agendada", meeting_held: "Reunión realizada",
  meeting_cancelled: "Reunión cancelada", proposal_sent: "Propuesta enviada",
  won: "Ganado", lost: "Perdido", suppressed: "No contactar", unsuppressed: "Restablecer contacto",
}

function MilestoneForm({ prospectId, onSaved }: { prospectId: string; onSaved: () => void }) {
  const id = useId()
  const [eventId] = useState(() => crypto.randomUUID())
  const [eventType, setEventType] = useState("meeting_scheduled")
  const [localNow] = useState(() => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 16))
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (_, form) => {
    const result = await recordReservasMilestone(form)
    if ("ok" in result) onSaved()
    return result
  }, null)
  const needsReason = ["lost", "suppressed", "unsuppressed"].includes(eventType)
  return <form action={action} className="space-y-4">
    <input type="hidden" name="prospect_id" value={prospectId} />
    <input type="hidden" name="event_id" value={eventId} />
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-type`}>Hito confirmado</Label>
      <select id={`${id}-type`} name="event_type" value={eventType} onChange={e => setEventType(e.target.value)}
        className="h-9 w-full rounded-md border bg-background px-3 text-sm">
        {Object.entries(EVENTS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select>
    </div>
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-occurred`}>Cuándo ocurrió el hecho · Argentina</Label>
      <Input id={`${id}-occurred`} name="occurred_at" type="datetime-local" defaultValue={localNow} required />
    </div>
    {eventType === "meeting_scheduled" && <div className="space-y-1.5">
      <Label htmlFor={`${id}-meeting`}>Fecha y hora acordadas de reunión · Argentina</Label>
      <Input id={`${id}-meeting`} name="scheduled_for" type="datetime-local" required />
    </div>}
    {needsReason && <div className="space-y-1.5">
      <Label htmlFor={`${id}-reason`}>Motivo {eventType === "unsuppressed" ? "y permiso confirmado" : ""}</Label>
      <Input id={`${id}-reason`} name="reason" maxLength={500} required />
    </div>}
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-note`}>Nota opcional</Label>
      <Textarea id={`${id}-note`} name="note" maxLength={2000} rows={3} />
    </div>
    {state && "error" in state && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    <Button type="submit" className="w-full" disabled={pending}>{pending ? "Guardando…" : "Registrar hito"}</Button>
  </form>
}

export function MilestoneDialog({ prospectId, name }: { prospectId: string; name: string }) {
  const [open, setOpen] = useState(false)
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger render={<Button variant="outline" size="sm" />}>Registrar hito</DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{name}</DialogTitle>
        <DialogDescription>Registrá lo que ocurrió. Las fechas se guardan en horario de Argentina; agendar una reunión no la marca como realizada.</DialogDescription>
      </DialogHeader>
      {open && <MilestoneForm prospectId={prospectId} onSaved={() => setOpen(false)} />}
    </DialogContent>
  </Dialog>
}
