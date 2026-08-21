"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Ban, MessageSquare, Pencil } from "lucide-react"
import { commentOnTask, toggleTask, updateTask } from "@/app/(app)/proyectos/actions"
import { completeActivity } from "@/app/(app)/quick-actions"
import { PRIORITY_LABELS } from "@/lib/constants"
import { formatDateShort } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { DashboardTask } from "@/lib/dashboard/queries"
import type { TaskBucket } from "@/lib/dashboard/utils"

type Filter = "todas" | "vencidas" | "hoy" | "bloqueadas" | "proximas"

const FILTERS: { value: Filter; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "vencidas", label: "Vencidas" },
  { value: "hoy", label: "Hoy" },
  { value: "bloqueadas", label: "Bloqueadas" },
  { value: "proximas", label: "Próximas" },
]

const BUCKET_LABEL: Record<TaskBucket, string> = {
  vencida: "Vencida",
  hoy: "Hoy",
  bloqueada: "Bloqueada",
  proxima: "Próxima",
  sin_fecha: "Sin fecha",
}

/** Sólo urgente y alta se destacan; media y baja no necesitan color. */
const PRIORITY_CLASS: Partial<Record<DashboardTask["priority"], string>> = {
  urgente: "text-destructive",
  alta: "text-amber-600 dark:text-amber-400",
}

function matchesFilter(task: DashboardTask, filter: Filter): boolean {
  if (filter === "todas") return true
  if (filter === "vencidas") return task.bucket === "vencida"
  if (filter === "hoy") return task.bucket === "hoy"
  if (filter === "bloqueadas") return task.bucket === "bloqueada"
  return task.bucket === "proxima"
}

export function DashboardTasks({
  tasks,
  profiles,
  limit = 8,
}: {
  tasks: DashboardTask[]
  profiles: { id: string; full_name: string }[]
  limit?: number
}) {
  const [filter, setFilter] = useState<Filter>("todas")
  const [showAll, setShowAll] = useState(false)

  const filtered = useMemo(
    () => tasks.filter((task) => matchesFilter(task, filter)),
    [tasks, filter]
  )
  const visible = showAll ? filtered : filtered.slice(0, limit)

  const counts = useMemo(
    () => ({
      todas: tasks.length,
      vencidas: tasks.filter((t) => t.bucket === "vencida").length,
      hoy: tasks.filter((t) => t.bucket === "hoy").length,
      bloqueadas: tasks.filter((t) => t.bucket === "bloqueada").length,
      proximas: tasks.filter((t) => t.bucket === "proxima").length,
    }),
    [tasks]
  )

  return (
    <div className="space-y-2.5">
      <div role="group" aria-label="Filtrar tareas" className="flex flex-wrap gap-1.5">
        {FILTERS.map((option) => {
          const active = option.value === filter
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              aria-pressed={active}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                active
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {option.label}
              <span className="ml-1.5 font-mono tabular-nums opacity-60">
                {counts[option.value]}
              </span>
            </button>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          {tasks.length === 0
            ? "No hay tareas abiertas en proyectos en curso."
            : "No hay tareas con este filtro."}
        </p>
      ) : (
        <ul className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
          {visible.map((task) => (
            <TaskRow key={task.id} task={task} profiles={profiles} />
          ))}
        </ul>
      )}

      {filtered.length > limit && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {showAll
            ? "Mostrar menos"
            : `Ver las ${filtered.length} tareas`}
        </button>
      )}
    </div>
  )
}

function TaskRow({ task, profiles }: { task: DashboardTask; profiles: { id: string; full_name: string }[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const blocked = task.status === "bloqueada"
  const [editing, setEditing] = useState(false)

  function complete() {
    startTransition(async () => {
      const result = task.source === "activity"
        ? await completeActivity(task.id)
        : await toggleTask(task.id, "completada", task.projectId!)
      if (result && "error" in result) {
        toast.error(`No se pudo completar: ${result.error}`)
        return
      }
      toast.success("Tarea completada")
      router.refresh()
    })
  }

  return (
    <li
      className={cn(
        "flex items-start gap-3 px-4 py-3 transition-opacity",
        pending && "pointer-events-none opacity-50"
      )}
    >
      <Checkbox
        checked={false}
        disabled={pending}
        onCheckedChange={complete}
        aria-label={`Completar «${task.title}»`}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium">{task.title}</span>
          {blocked && (
            <span className="inline-flex items-center gap-1 text-xs text-destructive">
              <Ban className="h-3 w-3" aria-hidden="true" />
              {BUCKET_LABEL.bloqueada}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {task.href ? (
            <Link href={task.href} className="hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {task.projectName}
            </Link>
          ) : task.projectName}
          {task.clientName && ` · ${task.clientName}`}
          {task.ownerName && ` · ${task.ownerName}`}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={cn(
            "font-mono text-xs tabular-nums",
            task.bucket === "vencida"
              ? "text-destructive"
              : task.bucket === "hoy"
                ? "text-foreground"
                : "text-muted-foreground"
          )}
        >
          {task.dueDate ? formatDateShort(task.dueDate) : "—"}
        </p>
        {PRIORITY_CLASS[task.priority] && (
          <p className={cn("text-[10px]", PRIORITY_CLASS[task.priority])}>
            {PRIORITY_LABELS[task.priority]}
          </p>
        )}
        {task.source === "project_task" && <Button variant="ghost" size="icon-xs" className="mt-1" aria-label={`Editar ${task.title}`} onClick={() => setEditing(true)}><Pencil className="size-3.5" /></Button>}
      </div>
      {editing && <TaskEditDialog task={task} profiles={profiles} onClose={() => setEditing(false)} />}
    </li>
  )
}

function TaskEditDialog({ task, profiles, onClose }: { task: DashboardTask; profiles: { id: string; full_name: string }[]; onClose: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  function run(action: Promise<{ error: string } | { ok: true; message?: string }>, success: string, close = false) {
    setError(null)
    startTransition(async () => {
      const result = await action
      if ("error" in result) { setError(result.error); return }
      toast.success(result.message ?? success)
      if (close) onClose()
      router.refresh()
    })
  }
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Editar tarea</DialogTitle><DialogDescription>Reasigná, priorizá o cambiá la fecha sin salir de Hoy.</DialogDescription></DialogHeader><form onSubmit={(event) => { event.preventDefault(); run(updateTask(null, new FormData(event.currentTarget)), "Tarea actualizada", true) }} className="grid gap-3 sm:grid-cols-2"><input type="hidden" name="task_id" value={task.id} /><input type="hidden" name="project_id" value={task.projectId ?? ""} /><input type="hidden" name="position" value={task.position} /><div className="space-y-1.5 sm:col-span-2"><Label>Título</Label><Input name="title" required defaultValue={task.title} /></div><div className="space-y-1.5 sm:col-span-2"><Label>Descripción</Label><Textarea name="description" defaultValue={task.description ?? ""} rows={2} /></div><div className="space-y-1.5"><Label>Responsable</Label><Select name="owner_id" defaultValue={task.ownerId ?? undefined} items={Object.fromEntries(profiles.map((profile) => [profile.id, profile.full_name]))}><SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger><SelectContent>{profiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.full_name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Vence</Label><Input name="due_date" type="date" defaultValue={task.dueDate ?? ""} /></div><div className="space-y-1.5"><Label>Prioridad</Label><Select name="priority" defaultValue={task.priority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PRIORITY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Estado</Label><Select name="status" defaultValue={task.status}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pendiente">Pendiente</SelectItem><SelectItem value="en_curso">En curso</SelectItem><SelectItem value="bloqueada">Bloqueada</SelectItem><SelectItem value="completada">Completada</SelectItem></SelectContent></Select></div>{error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}<DialogFooter className="sm:col-span-2"><Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar cambios"}</Button></DialogFooter></form><form onSubmit={(event) => { event.preventDefault(); run(commentOnTask(null, new FormData(event.currentTarget)), "Comentario agregado") }} className="border-t pt-4"><input type="hidden" name="task_id" value={task.id} /><input type="hidden" name="project_id" value={task.projectId ?? ""} /><input type="hidden" name="task_title" value={task.title} /><Label>Comentario</Label><div className="mt-2 flex gap-2"><Input name="body" required placeholder="Actualización o @mención" /><Button type="submit" variant="outline" disabled={pending}><MessageSquare className="size-4" /></Button></div></form></DialogContent></Dialog>
}
