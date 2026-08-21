"use client"

import { useActionState, useEffect } from "react"
import { CircleHelp, Send, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { upsertDailyUpdate } from "@/app/(app)/bandeja/actions"
import type { ActionResult } from "@/lib/action-result"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type DailyUpdate = {
  id: string
  profile_id: string
  progress: string
  next_focus: string | null
  blocker: string | null
  needs_help: boolean
  updated_at: string
  profile: { full_name: string } | null
}

export function DailyTeamUpdate({
  updates,
  currentProfileId,
}: {
  updates: DailyUpdate[]
  currentProfileId: string
}) {
  const own = updates.find((update) => update.profile_id === currentProfileId)
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    upsertDailyUpdate,
    null
  )

  useEffect(() => {
    if (state && "ok" in state) toast.success(state.message ?? "Actualización guardada")
  }, [state])

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b bg-card py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="label-mono text-primary">Pulso diario</p>
            <CardTitle className="mt-1 text-lg">Actualización del equipo</CardTitle>
          </div>
          <span className="label-mono rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
            {updates.length} hoy
          </span>
        </div>
      </CardHeader>
      <CardContent className="grid gap-0 p-0 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.85fr)]">
        <div className="divide-y lg:border-r">
          {updates.length === 0 ? (
            <div className="flex min-h-60 flex-col items-center justify-center px-6 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-warning/20 text-foreground">
                <Sparkles className="size-5" />
              </span>
              <p className="mt-4 font-heading font-semibold">Abrí el pulso del día</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Dejá el primer avance para que Santiago y Tomi compartan contexto.
              </p>
            </div>
          ) : (
            updates.map((update) => (
              <article key={update.id} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading text-xs font-semibold text-primary">
                    {(update.profile?.full_name || "E")
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join("")
                      .toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-heading text-sm font-semibold">
                        {update.profile?.full_name || "Equipo"}
                      </p>
                      {update.needs_help && (
                        <span className="label-mono inline-flex items-center gap-1 rounded-full bg-warning/20 px-2 py-0.5 text-foreground">
                          <CircleHelp className="size-3" /> Necesita ayuda
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed">{update.progress}</p>
                    {update.next_focus && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Sigue:</span>{" "}
                        {update.next_focus}
                      </p>
                    )}
                    {update.blocker && (
                      <p className="mt-1 text-xs text-destructive">
                        <span className="font-medium">Bloqueo:</span> {update.blocker}
                      </p>
                    )}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>

        <form action={action} className="space-y-4 bg-muted/20 p-5">
          <div>
            <p className="font-heading text-sm font-semibold">
              {own ? "Actualizar mi pulso" : "Dejar mi pulso"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Una actualización por persona y día; podés editarla.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="daily-progress">Qué avancé</Label>
            <Textarea
              id="daily-progress"
              name="progress"
              required
              rows={3}
              defaultValue={own?.progress ?? ""}
              placeholder="Resultado concreto, no una lista de intenciones"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="daily-next">Próximo foco</Label>
              <Input id="daily-next" name="next_focus" defaultValue={own?.next_focus ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="daily-blocker">Bloqueo</Label>
              <Input id="daily-blocker" name="blocker" defaultValue={own?.blocker ?? ""} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox name="needs_help" defaultChecked={own?.needs_help ?? false} />
            Necesito ayuda del equipo
          </label>
          {state && "error" in state && (
            <p role="alert" className="text-sm text-destructive">{state.error}</p>
          )}
          <Button type="submit" size="sm" disabled={pending}>
            <Send className="mr-1 size-4" />
            {pending ? "Guardando…" : own ? "Actualizar" : "Compartir"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
