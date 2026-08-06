"use client"

import { useActionState, useEffect, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { addTask, toggleTask } from "@/app/(app)/proyectos/actions"
import { PRIORITY_LABELS } from "@/lib/constants"
import type { Enums } from "@/lib/supabase/types"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export type Task = {
  id: string
  title: string
  status: Enums<"task_status">
  priority: Enums<"priority_level">
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
    startTransition(async () => {
      await toggleTask(task.id, next ? "completada" : "pendiente", projectId)
      router.refresh()
    })
  }

  return (
    <label className="flex items-center gap-3 rounded-md border p-2.5 text-sm">
      <Checkbox
        checked={completed}
        onCheckedChange={(v) => toggle(v === true)}
      />
      <span className={completed ? "text-muted-foreground line-through" : ""}>
        {task.title}
      </span>
      <span className="ml-auto text-xs text-muted-foreground">
        {PRIORITY_LABELS[task.priority]}
      </span>
    </label>
  )
}
