"use client"
import { useActionState, useState } from "react"
import { useRouter } from "next/navigation"
import { Bot, RefreshCw } from "lucide-react"
import { bookReservasMeeting, prepareReservasWithAgent, queueReservasReply, reviewReservasAgent } from "@/app/(app)/reservas-prospectos/actions"
import type { ActionResult } from "@/lib/action-result"
import { AGENT_ACTION_LABELS, type ReservasAgentPanel } from "@/lib/reservas-agent"
import { reservasTimestamp } from "@/lib/reservas-sales"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"

export function PrepareAgentButton({ prospectId, disabled }: { prospectId: string; disabled: boolean }) {
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (_, form) => {
    const result = await prepareReservasWithAgent(form)
    if ("ok" in result) setRequestId(crypto.randomUUID())
    return result
  }, null)
  return <form action={action} className="max-w-60">
    <input type="hidden" name="prospect_id" value={prospectId} /><input type="hidden" name="request_id" value={requestId} />
    <Button type="submit" variant="outline" size="sm" disabled={disabled || pending}><Bot />{pending ? "Preparando…" : "Preparar con IA"}</Button>
    {state && <p role="status" className="mt-1 text-xs">{"error" in state ? state.error : "Solicitud recibida. Actualizá para ver el resultado."}</p>}
  </form>
}

function RetryBooking({ runId }: { runId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (_, form) => bookReservasMeeting(form), null)
  return <form action={action} className="mt-2"><input type="hidden" name="run_id" value={runId} /><Button type="submit" size="sm" variant="outline" disabled={pending}>Reintentar guardar en agenda</Button>{state && "error" in state && <p role="alert" className="mt-1 text-xs text-destructive">{state.error}</p>}</form>
}
function RetryQueue({ runId }: { runId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (_, form) => queueReservasReply(form), null)
  return <form action={action} className="mt-2"><input type="hidden" name="run_id" value={runId} /><Button type="submit" size="sm" variant="outline" disabled={pending}>Confirmar recepción en cola</Button>{state && "error" in state && <p role="alert" className="mt-1 text-xs text-destructive">{state.error}</p>}</form>
}
function reviewLabel(run: ReservasAgentPanel["runs"][number]) {
  if (run.approval === "rejected") return "Rechazado"
  if (run.approval !== "approved") return "Revisar"
  if (run.result?.action === "book_meeting") return run.appointment_id ? "Agendada" : "Aprobada · agenda pendiente"
  return { none: "Aprobado · cola pendiente", transferring: "Recepción de cola sin confirmar", queued: "En cola", sent: "Enviado", blocked: "Envío detenido" }[run.delivery_state] ?? "Aprobado"
}
function Review({ run }: { run: ReservasAgentPanel["runs"][number] }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (_, form) => reviewReservasAgent(form), null)
  const canApprove = run.result && ["draft_message", "follow_up"].includes(run.result.action)
  const isMeeting = run.result?.action === "book_meeting"
  return <form action={action} className="mt-3 space-y-2">
    <input type="hidden" name="run_id" value={run.id} />
    {canApprove && <><label htmlFor={`draft-${run.id}`} className="text-xs font-medium">Borrador · podés editarlo</label>
      <Textarea id={`draft-${run.id}`} name="message" defaultValue={run.result?.draft ?? ""} rows={4} maxLength={2000} /></>}
    {isMeeting && run.result?.meeting && <p className="text-sm">Fecha acordada: {reservasTimestamp(run.result.meeting.start)} · fin {reservasTimestamp(run.result.meeting.end)}</p>}
    <div className="flex flex-wrap gap-2">{(canApprove || isMeeting) && <Button type="submit" name="decision" value="approved" disabled={pending}>{isMeeting ? "Aprobar y agendar" : "Aprobar borrador"}</Button>}
      <Button type="submit" variant="outline" name="decision" value="rejected" disabled={pending}>Rechazar</Button></div>
    {state && "error" in state && <p role="alert" className="text-xs text-destructive">{state.error}</p>}
  </form>
}

export function AgentReviewPanel({ panel, ready }: { panel: ReservasAgentPanel | null; ready: boolean }) {
  const router = useRouter()
  return <section className="rounded-xl border bg-card" aria-labelledby="agent-title">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
      <div><h2 id="agent-title" className="flex items-center gap-2 font-heading font-semibold"><Bot className="size-4" />Agente comercial · Hermes</h2>
        <p className="mt-1 text-xs text-muted-foreground">Después de la primera respuesta, el agente califica, conversa y coordina una reunión en el calendario interno. {ready ? "Prepará el próximo paso para tu revisión." : "Conexión del perfil de ventas pendiente de configuración y prueba."}</p></div>
      <Button variant="ghost" size="sm" onClick={() => router.refresh()}><RefreshCw />Actualizar</Button>
    </div>
    <div className="space-y-4 p-4">
      <p className="text-xs text-muted-foreground">Los mensajes se guardan para revisión. Una reunión aprobada se agenda sólo después de verificar disponibilidad. El envío de WhatsApp todavía no está habilitado.</p>
      {!panel ? <p role="alert" className="text-sm text-destructive">No se pudo consultar el estado del agente.</p> : <>
        {panel.pending > 0 && <p className="text-sm font-medium">{panel.pending} decisiones pendientes de revisión</p>}
        {panel.runs.length === 0 && <p className="text-sm text-muted-foreground">Sin ejecuciones registradas. Usá «Preparar con IA» en un alojamiento cuando la conexión esté lista.</p>}
        {panel.runs.map(run => <article key={run.id} className="border-l-2 border-primary/30 pl-4">
          <div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{run.name}</h3><Badge variant="secondary">{run.status === "review" ? reviewLabel(run) : ({ queued: "En espera", running: "Analizando", failed: "Requiere atención", blocked: "Detenido" }[run.status] ?? run.status)}</Badge></div>
          <p className="mt-1 text-xs text-muted-foreground">{reservasTimestamp(run.created_at)}</p>
          {run.result && <><p className="mt-2 text-sm font-medium">{AGENT_ACTION_LABELS[run.result.action]}</p><p className="mt-1 text-sm">{run.result.reason}</p>
            <p className="mt-1 text-xs text-muted-foreground">Confianza estimada por el modelo: {Math.round(run.result.confidence * 100)}%</p></>}
          {run.status === "review" && run.approval === "pending" ? <Review run={run} /> : run.approved_message && <p className="mt-2 whitespace-pre-wrap text-sm">{run.approved_message}</p>}
          {run.appointment_id && <a href="/calendario" className="mt-2 inline-block text-sm underline">Ver reunión en el calendario</a>}
          {run.approval === "approved" && run.result?.action === "book_meeting" && !run.appointment_id && <RetryBooking runId={run.id} />}
          {run.approval === "approved" && ["draft_message", "follow_up"].includes(run.result?.action ?? "") && run.delivery_state === "none" && <RetryQueue runId={run.id} />}
          {["failed", "blocked"].includes(run.status) && <p className="mt-2 text-sm text-muted-foreground">{run.error_code === "context_changed" ? "La conversación cambió. Prepará un nuevo análisis." : run.status === "blocked" ? "Caso bloqueado o cerrado; no se preparó un envío." : "El análisis no terminó. Revisá la conexión antes de reintentar."}</p>}
        </article>)}
        {panel.runs.length === 20 && <p className="text-xs text-muted-foreground">Se muestran las 20 ejecuciones más recientes.</p>}
      </>}
    </div>
  </section>
}
