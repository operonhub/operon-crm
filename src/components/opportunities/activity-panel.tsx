"use client"

import { useActionState, useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { StickyNote, Phone, Mail, Users, CheckSquare, Square } from "lucide-react"
import { addActivity, toggleActivity } from "@/app/(app)/oportunidades/actions"
import { ACTIVITY_TYPE_LABELS } from "@/lib/constants"
import { formatDate, isOverdue } from "@/lib/format"
import type { Enums } from "@/lib/supabase/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type Activity = {
  id: string
  type: Enums<"activity_type">
  body: string | null
  due_date: string | null
  completed: boolean
  created_at: string
}

const ICONS: Record<Enums<"activity_type">, React.ElementType> = {
  nota: StickyNote,
  llamada: Phone,
  email: Mail,
  reunion: Users,
  tarea: CheckSquare,
}

export function ActivityPanel({
  opportunityId,
  activities,
}: {
  opportunityId: string
  activities: Activity[]
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction, pending] = useActionState(addActivity, null)
  const [type, setType] = useState<Enums<"activity_type">>("nota")

  useEffect(() => {
    if (state && "ok" in state && state.ok) {
      formRef.current?.reset()
      setType("nota")
      router.refresh()
    }
  }, [state, router])

  return (
    <div className="space-y-4">
      <form
        ref={formRef}
        action={formAction}
        className="space-y-3 rounded-lg border bg-background p-4"
      >
        <input type="hidden" name="opportunity_id" value={opportunityId} />
        <input type="hidden" name="type" value={type} />
        <div className="flex items-center gap-2">
          <Select
            value={type}
            onValueChange={(v) => v && setType(v as Enums<"activity_type">)}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ACTIVITY_TYPE_LABELS).map(([k, label]) => (
                <SelectItem key={k} value={k}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(type === "tarea" || type === "reunion" || type === "llamada") && (
            <Input type="date" name="due_date" className="w-44" />
          )}
        </div>
        <Textarea
          name="body"
          rows={2}
          placeholder="Escribí la nota, resultado de la llamada, etc."
        />
        {state && "error" in state && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Agregando…" : "Agregar actividad"}
          </Button>
        </div>
      </form>

      <div className="space-y-2">
        {activities.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Sin actividades todavía.
          </p>
        ) : (
          activities.map((a) => (
            <ActivityRow
              key={a.id}
              activity={a}
              opportunityId={opportunityId}
            />
          ))
        )}
      </div>
    </div>
  )
}

function ActivityRow({
  activity: a,
  opportunityId,
}: {
  activity: Activity
  opportunityId: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const Icon = ICONS[a.type]
  const isTask = a.type === "tarea"

  function toggle() {
    startTransition(async () => {
      await toggleActivity(a.id, !a.completed, opportunityId)
      router.refresh()
    })
  }

  return (
    <div className="flex gap-3 rounded-lg border bg-background p-3">
      <div className="mt-0.5 text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {ACTIVITY_TYPE_LABELS[a.type]}
          </span>
          <span>· {formatDate(a.created_at)}</span>
          {a.due_date && !a.completed && (
            <span className={isOverdue(a.due_date) ? "text-red-600" : ""}>
              · vence {formatDate(a.due_date)}
            </span>
          )}
        </div>
        <p
          className={`mt-0.5 text-sm whitespace-pre-wrap ${
            a.completed ? "text-muted-foreground line-through" : ""
          }`}
        >
          {a.body}
        </p>
      </div>
      {isTask && (
        <button
          onClick={toggle}
          className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
          title={a.completed ? "Marcar pendiente" : "Marcar completada"}
        >
          {a.completed ? (
            <CheckSquare className="h-4 w-4 text-green-600" />
          ) : (
            <Square className="h-4 w-4" />
          )}
        </button>
      )}
    </div>
  )
}
