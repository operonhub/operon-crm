"use client"

import { useActionState, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Archive, Check, CircleAlert, Flag, Save, Users } from "lucide-react"
import { toast } from "sonner"
import {
  addBlocker,
  addMilestone,
  archiveProject,
  resolveBlocker,
  setProjectAgents,
  setProjectCollaborators,
  updateMilestoneStatus,
  updateProject,
} from "@/app/(app)/proyectos/actions"
import type { ActionResult } from "@/lib/action-result"
import { PROJECT_AREAS, PROJECT_AREA_LABELS, PROJECT_ENGAGEMENT_LABELS } from "@/lib/constants"
import { formatDate } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type Option = { id: string; name: string }
type Profile = { id: string; full_name: string }
type Milestone = { id: string; title: string; description: string | null; due_date: string | null; status: string }
type Blocker = { id: string; title: string; detail: string | null; status: string; owner: { full_name: string } | null }

function useFeedback(state: ActionResult | null) {
  useEffect(() => {
    if (!state) return
    if ("error" in state) toast.error(state.error)
    else toast.success(state.message ?? "Cambios guardados")
  }, [state])
}

export function ProjectOperationsPanel({
  project,
  clients,
  profiles,
  collaboratorIds,
  agents,
  linkedAgentIds,
  milestones,
  blockers,
  isAdmin,
}: {
  project: {
    id: string
    name: string
    area: string
    engagement_kind: string
    operational_type: string | null
    client_id: string | null
    owner_id: string | null
    scope: string | null
    conversion_goal: string | null
    kpi: string | null
    start_date: string | null
    due_date: string | null
    archived_at: string | null
  }
  clients: Option[]
  profiles: Profile[]
  collaboratorIds: string[]
  agents: Option[]
  linkedAgentIds: string[]
  milestones: Milestone[]
  blockers: Blocker[]
  isAdmin: boolean
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ProjectDataForm project={project} clients={clients} profiles={profiles} />
      <div className="space-y-4">
        <SelectionForm
          title="Colaboradores"
          icon={Users}
          projectId={project.id}
          options={profiles.map((profile) => ({ id: profile.id, name: profile.full_name }))}
          selected={collaboratorIds}
          fieldName="profile_ids"
          action={setProjectCollaborators}
        />
        {isAdmin && (
          <SelectionForm
            title="Agentes vinculados"
            icon={CircleAlert}
            projectId={project.id}
            options={agents}
            selected={linkedAgentIds}
            fieldName="agent_ids"
            action={setProjectAgents}
          />
        )}
      </div>
      <Milestones projectId={project.id} milestones={milestones} />
      <Blockers projectId={project.id} blockers={blockers} profiles={profiles} />
      {isAdmin && <ArchiveProject projectId={project.id} archived={!!project.archived_at} />}
    </div>
  )
}

function ProjectDataForm({ project, clients, profiles }: { project: Parameters<typeof ProjectOperationsPanel>[0]["project"]; clients: Option[]; profiles: Profile[] }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(updateProject, null)
  useFeedback(state)
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4"><CardTitle className="text-base">Edición operativa</CardTitle></CardHeader>
      <CardContent className="p-5">
        <form action={action} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="project_id" value={project.id} />
          <Field label="Nombre" wide><Input name="name" required defaultValue={project.name} /></Field>
          <Field label="Área"><Select name="area" defaultValue={project.area} items={PROJECT_AREA_LABELS}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PROJECT_AREAS.map((area) => <SelectItem key={area} value={area}>{PROJECT_AREA_LABELS[area]}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Modalidad"><Select name="engagement_kind" defaultValue={project.engagement_kind} items={PROJECT_ENGAGEMENT_LABELS}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PROJECT_ENGAGEMENT_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Cliente"><Select name="client_id" defaultValue={project.client_id ?? undefined} items={Object.fromEntries(clients.map((item) => [item.id, item.name]))}><SelectTrigger><SelectValue placeholder="Solo para modalidad cliente" /></SelectTrigger><SelectContent>{clients.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Responsable"><Select name="owner_id" defaultValue={project.owner_id ?? undefined} items={Object.fromEntries(profiles.map((item) => [item.id, item.full_name]))}><SelectTrigger><SelectValue placeholder="Sin responsable" /></SelectTrigger><SelectContent>{profiles.map((item) => <SelectItem key={item.id} value={item.id}>{item.full_name}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Tipo operativo"><Input name="operational_type" defaultValue={project.operational_type ?? ""} /></Field>
          <Field label="Inicio"><Input name="start_date" type="date" defaultValue={project.start_date ?? ""} /></Field>
          <Field label="Entrega"><Input name="due_date" type="date" defaultValue={project.due_date ?? ""} /></Field>
          <Field label="Objetivo de conversión"><Input name="conversion_goal" defaultValue={project.conversion_goal ?? ""} /></Field>
          <Field label="KPI"><Input name="kpi" defaultValue={project.kpi ?? ""} /></Field>
          <Field label="Alcance" wide><Textarea name="scope" rows={4} defaultValue={project.scope ?? ""} /></Field>
          <div className="sm:col-span-2"><Button type="submit" disabled={pending}><Save className="mr-1 size-4" />{pending ? "Guardando…" : "Guardar proyecto"}</Button></div>
        </form>
      </CardContent>
    </Card>
  )
}

function SelectionForm({ title, icon: Icon, projectId, options, selected, fieldName, action }: { title: string; icon: React.ElementType; projectId: string; options: Option[]; selected: string[]; fieldName: string; action: (_prev: unknown, fd: FormData) => Promise<ActionResult> }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null)
  useFeedback(state)
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4"><CardTitle className="flex items-center gap-2 text-base"><Icon className="size-4" />{title}</CardTitle></CardHeader>
      <CardContent className="p-5"><form action={formAction}><input type="hidden" name="project_id" value={projectId} /><div className="grid gap-2 sm:grid-cols-2">{options.length ? options.map((option) => <label key={option.id} className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" name={fieldName} value={option.id} defaultChecked={selected.includes(option.id)} className="size-4 accent-primary" />{option.name}</label>) : <p className="text-sm text-muted-foreground">Sin opciones disponibles.</p>}</div><Button className="mt-4" size="sm" variant="outline" type="submit" disabled={pending}>{pending ? "Guardando…" : "Actualizar"}</Button></form></CardContent>
    </Card>
  )
}

function Milestones({ projectId, milestones }: { projectId: string; milestones: Milestone[] }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(addMilestone, null)
  const [updating, startTransition] = useTransition()
  const router = useRouter()
  useFeedback(state)
  return <Card className="gap-0 py-0"><CardHeader className="border-b py-4"><CardTitle className="flex items-center gap-2 text-base"><Flag className="size-4" />Hitos</CardTitle></CardHeader><CardContent className="space-y-4 p-5"><form action={action} className="grid gap-2 sm:grid-cols-[1fr_auto_auto]"><input type="hidden" name="project_id" value={projectId} /><Input name="title" required placeholder="Nuevo hito" /><Input name="due_date" type="date" /><Button type="submit" disabled={pending}>Agregar</Button></form><div className="space-y-2">{milestones.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div><p className="text-sm font-medium">{item.title}</p><p className="label-mono mt-1 text-muted-foreground">{item.status} · {formatDate(item.due_date)}</p></div>{item.status !== "completed" && <Button size="sm" variant="ghost" disabled={updating} onClick={() => startTransition(async () => { const result = await updateMilestoneStatus(item.id, projectId, "completed"); if ("error" in result) toast.error(result.error); else { toast.success("Hito completado"); router.refresh() } })}><Check className="size-4" /></Button>}</div>)}{milestones.length === 0 && <p className="text-sm text-muted-foreground">Sin hitos todavía.</p>}</div></CardContent></Card>
}

function Blockers({ projectId, blockers, profiles }: { projectId: string; blockers: Blocker[]; profiles: Profile[] }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(addBlocker, null)
  const [resolving, startTransition] = useTransition()
  const router = useRouter()
  useFeedback(state)
  return <Card className="gap-0 py-0"><CardHeader className="border-b py-4"><CardTitle className="flex items-center gap-2 text-base"><CircleAlert className="size-4 text-warning" />Bloqueos</CardTitle></CardHeader><CardContent className="space-y-4 p-5"><form action={action} className="grid gap-2 sm:grid-cols-[1fr_12rem_auto]"><input type="hidden" name="project_id" value={projectId} /><Input name="title" required placeholder="Qué está bloqueado" /><Select name="owner_id" items={Object.fromEntries(profiles.map((item) => [item.id, item.full_name]))}><SelectTrigger><SelectValue placeholder="Responsable" /></SelectTrigger><SelectContent>{profiles.map((item) => <SelectItem key={item.id} value={item.id}>{item.full_name}</SelectItem>)}</SelectContent></Select><Button type="submit" disabled={pending}>Registrar</Button></form><div className="space-y-2">{blockers.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div><p className="text-sm font-medium">{item.title}</p><p className="label-mono mt-1 text-muted-foreground">{item.status} · {item.owner?.full_name ?? "Sin responsable"}</p></div>{item.status !== "resolved" && <Button size="sm" variant="outline" disabled={resolving} onClick={() => startTransition(async () => { const result = await resolveBlocker(item.id, projectId); if ("error" in result) toast.error(result.error); else { toast.success("Bloqueo resuelto"); router.refresh() } })}>Resolver</Button>}</div>)}{blockers.length === 0 && <p className="text-sm text-muted-foreground">No hay bloqueos abiertos.</p>}</div></CardContent></Card>
}

function ArchiveProject({ projectId, archived }: { projectId: string; archived: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(archiveProject, null)
  useFeedback(state)
  return <details className="rounded-xl border border-dashed p-4 xl:col-span-2"><summary className="text-sm font-medium">{archived ? "Restaurar proyecto" : "Archivar proyecto"}</summary><form action={action} className="mt-3 flex flex-col gap-3 sm:flex-row"><input type="hidden" name="project_id" value={projectId} /><input type="hidden" name="restore" value={archived ? "true" : "false"} />{!archived && <Input name="reason" required placeholder="Motivo del archivado" />}<Button variant="outline" type="submit" disabled={pending}><Archive className="mr-1 size-4" />{pending ? "Guardando…" : archived ? "Restaurar" : "Archivar"}</Button></form></details>
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <div className={wide ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}><Label>{label}</Label>{children}</div>
}
