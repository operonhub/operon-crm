"use client"

import { useActionState, useEffect, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { MoreHorizontal, Plus } from "lucide-react"
import { addTask, toggleTask } from "@/app/(app)/proyectos/actions"
import { PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/lib/constants"
import { formatDateShort } from "@/lib/format"
import type { Enums } from "@/lib/supabase/types"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type Task = {
  id: string
  title: string
  status: Enums<"task_status">
  priority: Enums<"priority_level">
  due_date: string | null
  owner: { full_name: string } | null
}

export function TaskList({
  projectId,
  tasks,
}: {
  projectId: string
  tasks: Task[]
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction, pending] = useActionState(addTask, null)

  useEffect(() => {
    if (state && "ok" in state && state.ok) {
      formRef.current?.reset()
      router.refresh()
    }
  }, [state, router])

  const done = tasks.filter((t) => t.status === "completada").length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {done} de {tasks.length} completadas
        </span>
      </div>

      <div className="space-y-1">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} projectId={projectId} />
        ))}
      </div>

      <form ref={formRef} action={formAction} className="flex gap-2">
        <input type="hidden" name="project_id" value={projectId} />
        <Input
          name="title"
          placeholder="Agregar tarea…"
          className="h-9"
          required
        />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          <Plus className="h-4 w-4" />
        </Button>
      </form>
    </div>
  )
}

function TaskRow({ task, projectId }: { task: Task; projectId: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const completed = task.status === "completada"

  function toggle(next: boolean) {
    changeStatus(next ? "completada" : "pendiente")
  }

  function changeStatus(status: Enums<"task_status">) {
    startTransition(async () => {
      await toggleTask(task.id, status, projectId)
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-3 rounded-md border p-2.5 text-sm">
      <Checkbox
        checked={completed}
        onCheckedChange={(v) => toggle(v === true)}
        aria-label={`${completed ? "Reabrir" : "Completar"} ${task.title}`}
      />
      <div className="min-w-0 flex-1">
        <span className={completed ? "text-muted-foreground line-through" : ""}>{task.title}</span>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {TASK_STATUS_LABELS[task.status]}
          {task.owner?.full_name && ` · ${task.owner.full_name}`}
          {task.due_date && ` · ${formatDateShort(task.due_date)}`}
        </p>
      </div>
      <span className="text-xs text-muted-foreground">{PRIORITY_LABELS[task.priority]}</span>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={`Cambiar estado de ${task.title}`} />}>
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Estado</DropdownMenuLabel>
          {Object.entries(TASK_STATUS_LABELS).map(([status, label]) => (
            <DropdownMenuItem key={status} disabled={task.status === status} onClick={() => changeStatus(status as Enums<"task_status">)}>
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
