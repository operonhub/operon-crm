"use client"

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react"
import { useRouter } from "next/navigation"
import {
  Archive,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
} from "lucide-react"
import { toast } from "sonner"
import {
  addTask,
  archiveTask,
  commentOnTask,
  reorderTask,
  toggleTask,
  updateTask,
} from "@/app/(app)/proyectos/actions"
import type { ActionResult } from "@/lib/action-result"
import { PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/lib/constants"
import { formatDateShort } from "@/lib/format"
import type { Enums } from "@/lib/supabase/types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

export type Task = {
  id: string
  title: string
  description: string | null
  status: Enums<"task_status">
  priority: Enums<"priority_level">
  due_date: string | null
  owner_id: string | null
  position: number
  owner: { full_name: string } | null
}
type Profile = { id: string; full_name: string }

export function TaskList({
  projectId,
  tasks,
  profiles,
}: {
  projectId: string
  tasks: Task[]
  profiles: Profile[]
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction, pending] = useActionState(addTask, null)

  useEffect(() => {
    if (state && "ok" in state) {
      formRef.current?.reset()
      toast.success(state.message ?? "Tarea creada")
      router.refresh()
    }
  }, [state, router])

  const done = tasks.filter((task) => task.status === "completada").length
  return (
    <div className="space-y-3">
      <span className="text-sm text-muted-foreground">
        {done} de {tasks.length} completadas
      </span>
      <div className="space-y-1">
        {tasks.map((task, index) => (
          <TaskRow
            key={task.id}
            task={task}
            projectId={projectId}
            profiles={profiles}
            canMoveUp={index > 0}
            canMoveDown={index < tasks.length - 1}
          />
        ))}
      </div>
      <form
        ref={formRef}
        action={formAction}
        className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_9rem_auto]"
      >
        <input type="hidden" name="project_id" value={projectId} />
        <Input name="title" placeholder="Agregar tarea…" required />
        <Select
          name="owner_id"
          items={Object.fromEntries(
            profiles.map((profile) => [profile.id, profile.full_name])
          )}
        >
          <SelectTrigger><SelectValue placeholder="Responsable" /></SelectTrigger>
          <SelectContent>
            {profiles.map((profile) => (
              <SelectItem key={profile.id} value={profile.id}>
                {profile.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input name="due_date" type="date" />
        <Button type="submit" variant="outline" disabled={pending}>
          <Plus className="size-4" />
        </Button>
      </form>
      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
    </div>
  )
}

function TaskRow({
  task,
  projectId,
  profiles,
  canMoveUp,
  canMoveDown,
}: {
  task: Task
  projectId: string
  profiles: Profile[]
  canMoveUp: boolean
  canMoveDown: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [commenting, setCommenting] = useState(false)
  const completed = task.status === "completada"

  function run(action: Promise<ActionResult>, success?: string) {
    startTransition(async () => {
      const result = await action
      if ("error" in result) toast.error(result.error)
      else if (success || result.message) toast.success(result.message ?? success)
      router.refresh()
    })
  }

  function changeStatus(status: Enums<"task_status">) {
    run(toggleTask(task.id, status, projectId))
  }

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border p-2.5 text-sm transition-colors hover:bg-muted/30">
        <Checkbox
          checked={completed}
          onCheckedChange={(value) =>
            changeStatus(value === true ? "completada" : "pendiente")
          }
          disabled={pending}
          aria-label={(completed ? "Reabrir " : "Completar ") + task.title}
        />
        <div className="min-w-0 flex-1">
          <span className={completed ? "text-muted-foreground line-through" : ""}>
            {task.title}
          </span>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {TASK_STATUS_LABELS[task.status]}
            {task.owner?.full_name && " · " + task.owner.full_name}
            {task.due_date && " · " + formatDateShort(task.due_date)}
          </p>
        </div>
        <span className="hidden text-xs text-muted-foreground sm:block">
          {PRIORITY_LABELS[task.priority]}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={pending}
                aria-label={"Acciones de " + task.title}
              />
            }
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setCommenting(true)}>
              <MessageSquare className="size-4" /> Comentar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Estado</DropdownMenuLabel>
              {Object.entries(TASK_STATUS_LABELS).map(([status, label]) => (
                <DropdownMenuItem
                  key={status}
                  disabled={task.status === status}
                  onClick={() => changeStatus(status as Enums<"task_status">)}
                >
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!canMoveUp}
              onClick={() =>
                run(reorderTask(task.id, projectId, Math.max(0, task.position - 1)))
              }
            >
              <ChevronUp className="size-4" /> Subir
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canMoveDown}
              onClick={() =>
                run(reorderTask(task.id, projectId, task.position + 1))
              }
            >
              <ChevronDown className="size-4" /> Bajar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => {
                if (window.confirm("¿Archivar la tarea “" + task.title + "”?")) {
                  run(archiveTask(task.id, projectId), "Tarea archivada")
                }
              }}
            >
              <Archive className="size-4" /> Archivar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <TaskEditDialog
        open={editing}
        onOpenChange={setEditing}
        task={task}
        projectId={projectId}
        profiles={profiles}
      />
      <TaskCommentDialog
        open={commenting}
        onOpenChange={setCommenting}
        task={task}
        projectId={projectId}
      />
    </>
  )
}

function TaskEditDialog({
  open,
  onOpenChange,
  task,
  projectId,
  profiles,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: Task
  projectId: string
  profiles: Profile[]
}) {
  const router = useRouter()
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    updateTask,
    null
  )
  useEffect(() => {
    if (state && "ok" in state) {
      toast.success(state.message ?? "Tarea actualizada")
      onOpenChange(false)
      router.refresh()
    }
  }, [onOpenChange, router, state])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar tarea</DialogTitle>
          <DialogDescription>
            Responsable, fecha, prioridad, estado y orden.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="task_id" value={task.id} />
          <input type="hidden" name="project_id" value={projectId} />
          <Field label="Título">
            <Input name="title" defaultValue={task.title} required />
          </Field>
          <Field label="Descripción">
            <Textarea
              name="description"
              defaultValue={task.description ?? ""}
              rows={3}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Estado">
              <Select name="status" defaultValue={task.status} items={TASK_STATUS_LABELS}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Prioridad">
              <Select name="priority" defaultValue={task.priority} items={PRIORITY_LABELS}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Responsable">
              <Select
                name="owner_id"
                defaultValue={task.owner_id ?? undefined}
                items={Object.fromEntries(
                  profiles.map((profile) => [profile.id, profile.full_name])
                )}
              >
                <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Vencimiento">
              <Input
                name="due_date"
                type="date"
                defaultValue={task.due_date ?? ""}
              />
            </Field>
            <Field label="Posición">
              <Input
                name="position"
                type="number"
                min="0"
                defaultValue={task.position}
              />
            </Field>
          </div>
          {state && "error" in state && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TaskCommentDialog({
  open,
  onOpenChange,
  task,
  projectId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: Task
  projectId: string
}) {
  const router = useRouter()
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    commentOnTask,
    null
  )
  useEffect(() => {
    if (state && "ok" in state) {
      toast.success(state.message ?? "Comentario agregado")
      onOpenChange(false)
      router.refresh()
    }
  }, [onOpenChange, router, state])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Comentar tarea</DialogTitle>
          <DialogDescription>
            El hilo también aparece en Bandeja. Podés mencionar @equipo.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="task_id" value={task.id} />
          <input type="hidden" name="task_title" value={task.title} />
          <input type="hidden" name="project_id" value={projectId} />
          <Textarea name="body" rows={5} required autoFocus />
          {state && "error" in state && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Enviando…" : "Comentar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
