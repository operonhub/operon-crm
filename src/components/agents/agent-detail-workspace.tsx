"use client"

import { useActionState, useEffect, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Activity,
  ArrowLeft,
  Bot,
  Cable,
  CircleAlert,
  CircleCheck,
  Clock3,
  FileText,
  Pause,
  Play,
  Settings2,
  ShieldCheck,
  Wrench,
} from "lucide-react"
import { toast } from "sonner"
import {
  decideAgentApproval,
  updateAgent,
  updateAgentStatus,
} from "@/app/(app)/agentes/actions"
import type { ActionResult } from "@/lib/action-result"
import { deriveAgentMetrics } from "@/lib/agents"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

type Person = { full_name: string } | null
type Agent = {
  id: string
  name: string
  slug: string
  description: string | null
  purpose: string | null
  instructions: string | null
  status: "draft" | "active" | "paused" | "archived"
  owner_id: string | null
  tools: string[]
  channels: string[]
  allowed_actions: string[]
  approval_required_actions: string[]
  prohibited_actions: string[]
  updated_at: string
  owner: Person
}
type Run = {
  id: string
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled"
  trigger_kind: string
  input_summary: string | null
  output_summary: string | null
  error_code: string | null
  error_message: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
  project: { name: string } | null
  client: { organization: { name: string } | null } | null
  initiator: Person
}
type Approval = {
  id: string
  action_type: string
  action_summary: string
  rationale: string | null
  status: "pending" | "approved" | "rejected" | "cancelled"
  requested_at: string
  decision_note: string | null
  requester: Person
  decider: Person
}
type ProjectLink = {
  project_id: string
  responsibility: string | null
  project: { id: string; name: string; status: string } | null
}
type Audit = {
  id: number
  action: string
  metadata: unknown
  created_at: string
  actor: Person
}

const TABS = [
  ["resumen", "Resumen", FileText],
  ["configuracion", "Configuración", Settings2],
  ["herramientas", "Herramientas", Wrench],
  ["canales", "Canales", Cable],
  ["ejecuciones", "Ejecuciones", Activity],
  ["aprobaciones", "Aprobaciones", ShieldCheck],
  ["errores", "Errores", CircleAlert],
  ["actividad", "Actividad", Clock3],
] as const

function formatDateTime(value: string | null) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export function AgentDetailWorkspace({
  agent,
  runs,
  approvals,
  projects,
  profiles,
  activity,
  isAdmin,
  tab,
}: {
  agent: Agent
  runs: Run[]
  approvals: Approval[]
  projects: ProjectLink[]
  profiles: { id: string; full_name: string }[]
  activity: Audit[]
  isAdmin: boolean
  tab: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const metrics = deriveAgentMetrics(runs, approvals)

  function changeStatus(status: Agent["status"]) {
    startTransition(async () => {
      const result = await updateAgentStatus(agent.id, status)
      if ("error" in result) toast.error(result.error)
      else toast.success("Estado actualizado")
      router.refresh()
    })
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] p-4 sm:p-6">
      <Link href="/agentes" className="label-mono inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> Volver a agentes
      </Link>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Bot className="size-6" /></span>
          <div>
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-semibold tracking-[-0.035em]">{agent.name}</h1><Badge variant="outline">{agent.status}</Badge></div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{agent.description || agent.purpose || "Sin descripción"}</p>
            <p className="label-mono mt-2 text-muted-foreground">Responsable: {agent.owner?.full_name ?? "Sin asignar"} · {agent.slug}</p>
          </div>
        </div>
        {isAdmin && agent.status !== "archived" && (
          <div className="flex gap-2">
            {agent.status === "active" ? (
              <Button variant="outline" disabled={pending} onClick={() => changeStatus("paused")}><Pause className="mr-1 size-4" />Pausar</Button>
            ) : (
              <Button disabled={pending} onClick={() => changeStatus("active")}><Play className="mr-1 size-4" />Activar</Button>
            )}
            {agent.status !== "active" && <Button variant="ghost" disabled={pending} onClick={() => changeStatus("archived")}>Archivar</Button>}
          </div>
        )}
      </div>

      <nav className="mt-6 flex gap-1 overflow-x-auto rounded-xl border bg-card p-1">
        {TABS.map(([value, label, Icon]) => (
          <Link key={value} href={`/agentes/${agent.id}?tab=${value}`} className={cn("inline-flex min-w-max items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium", tab === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="size-4" />{label}</Link>
        ))}
      </nav>

      <div className="mt-6">
        {tab === "configuracion" ? (
          <AgentConfiguration agent={agent} profiles={profiles} isAdmin={isAdmin} />
        ) : tab === "herramientas" ? (
          <StringPolicy title="Herramientas declaradas" items={agent.tools} empty="No hay herramientas configuradas." note="Solo se guardan nombres/capacidades; nunca credenciales." />
        ) : tab === "canales" ? (
          <StringPolicy title="Canales declarados" items={agent.channels} empty="No hay canales conectados." note="Un canal en esta lista no implica una integración activa." />
        ) : tab === "ejecuciones" ? (
          <RunsTable runs={runs} />
        ) : tab === "aprobaciones" ? (
          <Approvals approvals={approvals} agentId={agent.id} isAdmin={isAdmin} />
        ) : tab === "errores" ? (
          <RunsTable runs={runs.filter((run) => run.status === "failed")} errorsOnly />
        ) : tab === "actividad" ? (
          <ActivityLog activity={activity} />
        ) : (
          <AgentSummary agent={agent} metrics={metrics} projects={projects} />
        )}
      </div>
    </div>
  )
}

function AgentSummary({ agent, metrics, projects }: { agent: Agent; metrics: ReturnType<typeof deriveAgentMetrics>; projects: ProjectLink[] }) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-3">
        <MetricCard label="Ejecuciones" value={String(metrics.totalRuns)} icon={Activity} />
        <MetricCard label="Tasa de éxito" value={metrics.successRate === null ? "—" : `${metrics.successRate}%`} icon={CircleCheck} />
        <MetricCard label="Errores" value={String(metrics.failedRuns)} icon={CircleAlert} />
        <MetricCard label="Aprobaciones pendientes" value={String(metrics.pendingApprovals)} icon={ShieldCheck} />
        <MetricCard label="Duración promedio" value={metrics.averageDurationSeconds === null ? "—" : `${metrics.averageDurationSeconds}s`} icon={Clock3} />
      </div>
      <Card className="gap-4 p-5">
        <div><p className="label-mono text-primary">Política</p><h2 className="mt-1 font-heading text-lg font-semibold">Límites de acción</h2></div>
        <PolicyList title="Sin aprobación" items={agent.allowed_actions} />
        <PolicyList title="Requiere aprobación" items={agent.approval_required_actions} />
        <PolicyList title="Prohibido" items={agent.prohibited_actions} destructive />
      </Card>
      <Card className="gap-0 overflow-hidden py-0 lg:col-span-3">
        <CardHeader className="border-b py-4"><CardTitle className="text-base">Proyectos vinculados</CardTitle></CardHeader>
        {projects.length === 0 ? <CardContent className="py-8 text-sm text-muted-foreground">Todavía no está vinculado a proyectos.</CardContent> : projects.map((link) => <Link key={link.project_id} href={`/proyectos/${link.project_id}`} className="flex items-center justify-between border-b px-5 py-3 text-sm hover:bg-muted/40"><span>{link.project?.name ?? "Proyecto"}</span><span className="label-mono text-muted-foreground">{link.project?.status}</span></Link>)}
      </Card>
    </div>
  )
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  return <Card className="gap-0 p-5"><div className="flex items-center justify-between"><p className="label-mono text-muted-foreground">{label}</p><Icon className="size-4 text-primary" /></div><p className="mt-4 font-mono text-3xl font-semibold tabular-nums">{value}</p></Card>
}

function PolicyList({ title, items, destructive = false }: { title: string; items: string[]; destructive?: boolean }) {
  return <div><p className={cn("label-mono", destructive ? "text-destructive" : "text-muted-foreground")}>{title}</p>{items.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">Sin acciones declaradas</p> : <ul className="mt-2 space-y-1 text-sm">{items.map((item) => <li key={item}>• {item}</li>)}</ul>}</div>
}

function AgentConfiguration({ agent, profiles, isAdmin }: { agent: Agent; profiles: { id: string; full_name: string }[]; isAdmin: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(updateAgent, null)
  useEffect(() => {
    if (state && "ok" in state) toast.success(state.message ?? "Agente actualizado")
  }, [state])
  return (
    <Card className="max-w-4xl gap-0 py-0">
      <CardHeader className="border-b py-5"><CardTitle>Configuración explícita</CardTitle></CardHeader>
      <CardContent className="p-5">
        <form action={action} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="agent_id" value={agent.id} />
          <Field label="Nombre"><Input name="name" defaultValue={agent.name} required disabled={!isAdmin} /></Field>
          <Field label="Slug"><Input name="slug" defaultValue={agent.slug} required disabled={!isAdmin} /></Field>
          <Field label="Propósito" wide><Textarea name="purpose" defaultValue={agent.purpose ?? ""} rows={3} required disabled={!isAdmin} /></Field>
          <Field label="Descripción" wide><Input name="description" defaultValue={agent.description ?? ""} disabled={!isAdmin} /></Field>
          <Field label="Instrucciones" wide><Textarea name="instructions" defaultValue={agent.instructions ?? ""} rows={7} disabled={!isAdmin} placeholder="Sin claves, tokens ni credenciales" /></Field>
          <Field label="Responsable"><Select name="owner_id" defaultValue={agent.owner_id ?? undefined} disabled={!isAdmin} items={Object.fromEntries(profiles.map((profile) => [profile.id, profile.full_name]))}><SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger><SelectContent>{profiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.full_name}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Herramientas (una por línea)"><Textarea name="tools" defaultValue={agent.tools.join("\n")} rows={5} disabled={!isAdmin} /></Field>
          <Field label="Canales declarados (uno por línea)"><Textarea name="channels" defaultValue={agent.channels.join("\n")} rows={5} disabled={!isAdmin} /></Field>
          <Field label="Acciones sin aprobación"><Textarea name="allowed_actions" defaultValue={agent.allowed_actions.join("\n")} rows={5} disabled={!isAdmin} /></Field>
          <Field label="Acciones con aprobación"><Textarea name="approval_required_actions" defaultValue={agent.approval_required_actions.join("\n")} rows={5} disabled={!isAdmin} /></Field>
          {state && "error" in state && <p className="text-sm text-destructive sm:col-span-2">{state.error}</p>}
          {isAdmin && <div className="sm:col-span-2"><Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar configuración"}</Button></div>}
        </form>
      </CardContent>
    </Card>
  )
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <div className={cn("space-y-1.5", wide && "sm:col-span-2")}><Label>{label}</Label>{children}</div>
}

function StringPolicy({ title, items, empty, note }: { title: string; items: string[]; empty: string; note: string }) {
  return <Card className="max-w-3xl gap-0 p-5"><p className="label-mono text-primary">Catálogo</p><h2 className="mt-1 font-heading text-xl font-semibold">{title}</h2><p className="mt-2 text-sm text-muted-foreground">{note}</p>{items.length === 0 ? <p className="mt-8 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{empty}</p> : <div className="mt-5 flex flex-wrap gap-2">{items.map((item) => <Badge key={item} variant="outline">{item}</Badge>)}</div>}</Card>
}

function RunsTable({ runs, errorsOnly = false }: { runs: Run[]; errorsOnly?: boolean }) {
  return <Card className="gap-0 overflow-hidden py-0"><CardHeader className="border-b py-4"><CardTitle className="text-base">{errorsOnly ? "Errores reales" : "Ejecuciones registradas"}</CardTitle></CardHeader>{runs.length === 0 ? <CardContent className="py-12 text-center text-sm text-muted-foreground">{errorsOnly ? "No hay errores registrados." : "Todavía no hay ejecuciones. El CRM no simula un runner."}</CardContent> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b bg-muted/30"><tr><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Contexto</th><th className="px-4 py-3">Inicio</th><th className="px-4 py-3">Fin</th><th className="px-4 py-3">Resultado</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id} className="border-b"><td className="px-4 py-3"><Badge variant="outline">{run.status}</Badge></td><td className="px-4 py-3">{run.project?.name ?? run.client?.organization?.name ?? run.trigger_kind}</td><td className="px-4 py-3 font-mono text-xs">{formatDateTime(run.started_at)}</td><td className="px-4 py-3 font-mono text-xs">{formatDateTime(run.finished_at)}</td><td className="max-w-sm px-4 py-3 text-muted-foreground">{run.error_message ?? run.output_summary ?? "—"}</td></tr>)}</tbody></table></div>}</Card>
}

function Approvals({ approvals, agentId, isAdmin }: { approvals: Approval[]; agentId: string; isAdmin: boolean }) {
  const router = useRouter(); const [pending, startTransition] = useTransition()
  return <div className="space-y-3">{approvals.length === 0 ? <Card className="p-10 text-center text-sm text-muted-foreground">No hay solicitudes de aprobación.</Card> : approvals.map((approval) => <Card key={approval.id} className="gap-3 p-5"><div className="flex items-start justify-between gap-3"><div><p className="label-mono text-primary">{approval.action_type}</p><h3 className="mt-1 font-heading font-semibold">{approval.action_summary}</h3><p className="mt-1 text-sm text-muted-foreground">{approval.rationale ?? "Sin justificación adicional"}</p></div><Badge variant="outline">{approval.status}</Badge></div>{approval.status === "pending" && isAdmin && <form onSubmit={(event) => {event.preventDefault(); const fd = new FormData(event.currentTarget); fd.set("approval_id", approval.id); fd.set("agent_id", agentId); startTransition(async () => {const result = await decideAgentApproval(null, fd); if ("error" in result) toast.error(result.error); else toast.success(result.message); router.refresh()})}} className="flex flex-col gap-2 sm:flex-row"><Input name="decision_note" required placeholder="Nota de decisión" className="flex-1" /><Button name="status" value="approved" disabled={pending}>Aprobar</Button><Button name="status" value="rejected" variant="outline" disabled={pending}>Rechazar</Button></form>}{approval.decision_note && <p className="text-xs text-muted-foreground">Decisión: {approval.decision_note}</p>}</Card>)}</div>
}

function ActivityLog({ activity }: { activity: Audit[] }) {
  return <Card className="gap-0 overflow-hidden py-0">{activity.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">Sin actividad registrada.</div> : activity.map((item, index) => <div key={item.id} className={cn("flex items-center justify-between gap-4 px-5 py-3", index > 0 && "border-t")}><div><p className="text-sm font-medium">{item.action.replaceAll("_", " ")}</p><p className="text-xs text-muted-foreground">{item.actor?.full_name ?? "Sistema"}</p></div><time className="label-mono text-muted-foreground">{formatDateTime(item.created_at)}</time></div>)}</Card>
}
