"use client"
import { useActionState, useState } from "react"
import { manageCalendar } from "@/app/(app)/calendario/actions"
import type { ActionResult } from "@/lib/action-result"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

type Team = { id: string; name: string }[]
function MeetingForm({ day, saved, team }: { day: string; saved: () => void; team: Team }) {
  const [requestId] = useState(() => crypto.randomUUID())
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (_, form) => {
    const result = await manageCalendar(form)
    if ("ok" in result) saved()
    return result
  }, null)
  return <form action={action} className="space-y-4">
    <input type="hidden" name="action" value="create" /><input type="hidden" name="request_id" value={requestId} />
    <div className="space-y-1"><Label htmlFor="meeting-title">Con quién / motivo</Label><Input id="meeting-title" name="title" required maxLength={200} placeholder="Reunión con…" /></div>
    <div className="space-y-1"><Label htmlFor="meeting-start">Fecha y hora · Argentina</Label><Input id="meeting-start" name="start" type="datetime-local" defaultValue={`${day}T12:00`} required /></div>
    <div className="space-y-1"><Label htmlFor="meeting-duration">Duración</Label><select id="meeting-duration" name="duration" defaultValue="20" className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="15">15 minutos</option><option value="20">20 minutos</option></select></div>
    <div className="space-y-1"><Label htmlFor="meeting-notes">Notas / enlace de videollamada</Label><Textarea id="meeting-notes" name="notes" rows={3} maxLength={2000} /></div>
    <div className="space-y-1"><Label htmlFor="meeting-responsible">Responsable</Label><select id="meeting-responsible" name="responsible_id" defaultValue="" className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="">Sin asignar</option>{team.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
    <div className="space-y-1"><Label htmlFor="meeting-confirmation">Confirmación del cliente</Label><select id="meeting-confirmation" name="confirmation" defaultValue="confirmed" className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="confirmed">Confirmada</option><option value="pending">Pendiente de confirmar</option></select></div>
    <p className="text-xs text-muted-foreground">La reunión será visible para todo el equipo.</p>
    {state && "error" in state && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Agendar reunión"}</Button>
  </form>
}
export function NewMeeting({ day, team }: { day: string; team: Team }) {
  const [open, setOpen] = useState(false)
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={<Button />}>Agendar reunión</DialogTrigger>
    <DialogContent><DialogHeader><DialogTitle>Nueva reunión</DialogTitle><DialogDescription>Horario coordinado con el cliente. Sin franjas fijas; se verifica que no haya otra reunión.</DialogDescription></DialogHeader>
      {open && <MeetingForm day={day} team={team} saved={() => setOpen(false)} />}</DialogContent></Dialog>
}
export function MeetingStatusControls({ id, canComplete, confirmation, responsibleId, team }: { id: string; canComplete: boolean; confirmation: string; responsibleId: string | null; team: Team }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (_, form) => manageCalendar(form), null)
  return <form action={action} className="mt-3"><input type="hidden" name="appointment_id" value={id} />
    <div className="mb-2 flex items-center gap-2"><select aria-label="Responsable" name="responsible_id" defaultValue={responsibleId ?? ""} className="h-8 max-w-48 rounded border bg-background px-2 text-xs"><option value="">Sin asignar</option>{team.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><Button size="sm" variant="outline" type="submit" name="action" value="assign" disabled={pending}>Asignar</Button></div>
    <div className="flex flex-wrap gap-2">{confirmation === "pending" && <Button size="sm" variant="outline" type="submit" name="action" value="confirm" disabled={pending}>Confirmar reunión</Button>}{canComplete && confirmation === "confirmed" && <Button size="sm" variant="outline" type="submit" name="action" value="held" disabled={pending}>Marcar realizada</Button>}
      <Button size="sm" variant="ghost" type="submit" name="action" value="cancelled" disabled={pending}>Cancelar reunión</Button></div>
    {state && "error" in state && <p role="alert" className="mt-1 text-xs text-destructive">{state.error}</p>}
  </form>
}
