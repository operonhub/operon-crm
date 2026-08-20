"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Ban } from "lucide-react"
import { toggleTask } from "@/app/(app)/proyectos/actions"
import { completeActivity } from "@/app/(app)/quick-actions"
import { PRIORITY_LABELS } from "@/lib/constants"
import { formatDateShort } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
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
  limit = 8,
}: {
  tasks: DashboardTask[]
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
            <TaskRow key={task.id} task={task} />
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

function TaskRow({ task }: { task: DashboardTask }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const blocked = task.status === "bloqueada"

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
      </div>
    </li>
  )
}
