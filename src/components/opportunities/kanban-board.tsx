"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MoreVertical, AlertTriangle, Search } from "lucide-react"
import { moveStage } from "@/app/(app)/oportunidades/actions"
import {
  ACTIVE_STAGES,
  CLOSED_STAGES,
  OPPORTUNITY_STAGES,
  SERVICE_TYPE_LABELS,
  STAGE_LABELS,
} from "@/lib/constants"
import { formatMoney, formatDateShort, isOverdue, todayISO } from "@/lib/format"
import type { Enums } from "@/lib/supabase/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type OppCard = {
  id: string
  title: string
  stage: Enums<"opportunity_stage">
  service_type: Enums<"service_type"> | null
  estimated_value: number | null
  currency: string
  next_action: string | null
  next_action_date: string | null
  organization: { name: string } | null
  owner: { full_name: string } | null
}

export function KanbanBoard({ opportunities }: { opportunities: OppCard[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [pending, setPending] = useState<string | null>(null)
  const [moveDialog, setMoveDialog] = useState<{
    id: string
    stage: Enums<"opportunity_stage">
    title: string
  } | null>(null)
  const [query, setQuery] = useState("")
  const [owner, setOwner] = useState("all")
  const [service, setService] = useState("all")
  const [state, setState] = useState<"active" | "closed" | "all">("active")

  const owners = useMemo(
    () => [...new Set(opportunities.map((opportunity) => opportunity.owner?.full_name).filter(Boolean) as string[])].sort(),
    [opportunities]
  )

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return opportunities.filter((opportunity) => {
      if (state === "active" && !ACTIVE_STAGES.includes(opportunity.stage)) return false
      if (state === "closed" && !CLOSED_STAGES.includes(opportunity.stage)) return false
      if (owner !== "all" && opportunity.owner?.full_name !== owner) return false
      if (service !== "all" && opportunity.service_type !== service) return false
      if (term && !`${opportunity.title} ${opportunity.organization?.name ?? ""}`.toLowerCase().includes(term)) return false
      return true
    })
  }, [opportunities, owner, query, service, state])

  function doMove(id: string, stage: Enums<"opportunity_stage">, title: string) {
    setPending(id)
    startTransition(async () => {
      const res = await moveStage(id, stage)
      setPending(null)
      if (!res.ok && "needsNextAction" in res) {
        setMoveDialog({ id, stage, title })
      } else {
        router.refresh()
      }
    })
  }

  const byStage = (stage: Enums<"opportunity_stage">) =>
    filtered.filter((o) => o.stage === stage)

  const visibleStages = OPPORTUNITY_STAGES.filter((stage) => {
    if (state === "active") return ACTIVE_STAGES.includes(stage)
    if (state === "closed") return CLOSED_STAGES.includes(stage)
    return true
  })

  return (
    <>
      <div className="mb-4 grid gap-2 rounded-xl border bg-background p-3 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_12rem_13rem_11rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar oportunidad o empresa" className="pl-9" aria-label="Buscar oportunidades" />
        </div>
        <Select value={owner} onValueChange={(value) => value && setOwner(value)}>
          <SelectTrigger><SelectValue placeholder="Responsable" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los responsables</SelectItem>
            {owners.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={service} onValueChange={(value) => value && setService(value)}>
          <SelectTrigger><SelectValue placeholder="Área o servicio" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los servicios</SelectItem>
            {Object.entries(SERVICE_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={state} onValueChange={(value) => setState(value as typeof state)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="active">Activas</SelectItem><SelectItem value="closed">Cerradas</SelectItem><SelectItem value="all">Todas</SelectItem></SelectContent>
        </Select>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {visibleStages.map((stage) => {
          const cards = byStage(stage)
          const totals = cards.reduce<Record<string, number>>((sum, card) => {
            sum[card.currency] = (sum[card.currency] ?? 0) + (card.estimated_value ?? 0)
            return sum
          }, {})
          return (
            <div key={stage} className="flex w-72 shrink-0 flex-col">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-medium">
                  {STAGE_LABELS[stage]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {cards.length}
                  {Object.entries(totals).filter(([, total]) => total > 0).map(([currency, total]) => ` · ${formatMoney(total, currency)}`).join("")}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2 rounded-lg bg-muted/40 p-2">
                {cards.map((c) => (
                  <div
                    key={c.id}
                    className={`group rounded-md border bg-background p-3 shadow-sm ${
                      pending === c.id ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/oportunidades/${c.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {c.title}
                      </Link>
                      <MoveMenu
                        current={c.stage}
                        onMove={(s) => doMove(c.id, s, c.title)}
                      />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {c.organization?.name ?? "—"}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs font-medium">
                        {formatMoney(c.estimated_value, c.currency)}
                      </span>
                      {c.owner && <span className="max-w-28 truncate text-xs text-muted-foreground">{c.owner.full_name}</span>}
                    </div>
                    {c.next_action && (
                      <div
                        className={`mt-2 flex items-center gap-1 border-t pt-2 text-xs ${
                          isOverdue(c.next_action_date)
                            ? "text-destructive"
                            : "text-muted-foreground"
                        }`}
                      >
                        {isOverdue(c.next_action_date) && (
                          <AlertTriangle className="h-3 w-3" />
                        )}
                        <span className="truncate">{c.next_action}</span>
                        <span className="ml-auto shrink-0">
                          {formatDateShort(c.next_action_date)}
                        </span>
                      </div>
                    )}
                    {!c.next_action && ACTIVE_STAGES.includes(c.stage) && (
                      <div className="mt-2 flex items-center gap-1 border-t pt-2 text-xs text-destructive">
                        <AlertTriangle className="h-3 w-3" /> Sin próxima acción
                      </div>
                    )}
                  </div>
                ))}
                {cards.length === 0 && (
                  <p className="px-1 py-4 text-center text-xs text-muted-foreground">
                    —
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <NextActionDialog
        open={moveDialog !== null}
        title={moveDialog?.title ?? ""}
        onClose={() => setMoveDialog(null)}
        onConfirm={(action, date) => {
          if (!moveDialog) return
          const { id, stage } = moveDialog
          setMoveDialog(null)
          setPending(id)
          startTransition(async () => {
            await moveStage(id, stage, action, date)
            setPending(null)
            router.refresh()
          })
        }}
      />
    </>
  )
}

function MoveMenu({
  current,
  onMove,
}: {
  current: Enums<"opportunity_stage">
  onMove: (stage: Enums<"opportunity_stage">) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          />
        }
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Mover a</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPPORTUNITY_STAGES.filter((s) => s !== current).map((s) => (
          <DropdownMenuItem key={s} onClick={() => onMove(s)}>
            {STAGE_LABELS[s]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NextActionDialog({
  open,
  title,
  onClose,
  onConfirm,
}: {
  open: boolean
  title: string
  onClose: () => void
  onConfirm: (action: string, date: string) => void
}) {
  const [action, setAction] = useState("")
  const [date, setDate] = useState(todayISO())

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Próxima acción requerida</DialogTitle>
          <DialogDescription>
            &ldquo;{title}&rdquo; pasa a una etapa activa. Definí la próxima
            acción con fecha.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="na">Próxima acción</Label>
            <Input
              id="na"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="Ej: enviar propuesta"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nad">Fecha</Label>
            <Input
              id="nad"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!action || !date}
            onClick={() => onConfirm(action, date)}
          >
            Mover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
