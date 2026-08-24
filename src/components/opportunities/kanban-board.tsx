"use client"

/**
 * Pipeline como embudo.
 *
 * El ancho de cada etapa es proporcional a cuántas oportunidades tiene, así
 * dónde se traba el pipeline se ve antes de leer un solo número. Las columnas
 * de ancho fijo que había antes daban siete carriles iguales, la mayoría
 * vacíos, y escondían justamente esa información.
 *
 * La banda de encabezado va en grafito igual que el panel de Hoy: es el mismo
 * gesto de "cabina de control". El resto de la pantalla sigue en papel, porque
 * una pantalla oscura suelta entre Clientes, Proyectos y Finanzas se leería
 * como otra aplicación.
 */

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MoreVertical, AlertTriangle, Search, Clock, X } from "lucide-react"
import { moveStage } from "@/app/(app)/oportunidades/actions"
import {
  ACTIVE_STAGES,
  CLOSED_STAGES,
  OPPORTUNITY_STAGES,
  SERVICE_TYPE_LABELS,
  STAGE_LABELS,
} from "@/lib/constants"
import {
  funnelWidths,
  nextActionOf,
  reachedShares,
  stalenessOf,
  type Staleness,
} from "@/lib/pipeline/funnel"
import { formatMoney, formatDateShort, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
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
  DropdownMenuGroup,
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
  updated_at: string
  /** Actividad más reciente o última edición, lo que sea posterior. */
  last_movement_at: string
  organization: { name: string } | null
  owner: { full_name: string } | null
}

/** A partir de acá una oportunidad cuenta como frenada. */
const DIAS_FRENADA = 7

type Foco = "todas" | "sin-accion" | "frenadas"

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
  const [foco, setFoco] = useState<Foco>("todas")
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<Enums<"opportunity_stage"> | null>(
    null
  )

  const hoy = todayISO()

  const owners = useMemo(
    () => [
      ...new Set(
        opportunities
          .map((opportunity) => opportunity.owner?.full_name)
          .filter(Boolean) as string[]
      ),
    ].sort(),
    [opportunities]
  )

  /** Las señales se cuentan sobre lo activo, que es donde se puede actuar. */
  const señales = useMemo(() => {
    const activas = opportunities.filter((o) => ACTIVE_STAGES.includes(o.stage))
    const totales = activas.reduce<Record<string, number>>((sum, o) => {
      sum[o.currency] = (sum[o.currency] ?? 0) + (o.estimated_value ?? 0)
      return sum
    }, {})
    return {
      valor: Object.entries(totales)
        .filter(([, total]) => total > 0)
        .map(([currency, total]) => formatMoney(total, currency))
        .join(" · "),
      sinAccion: activas.filter(
        (o) => nextActionOf(o.next_action, o.next_action_date, hoy).state === "sin-definir"
      ).length,
      frenadas: activas.filter((o) => {
        const dias = stalenessOf(o.last_movement_at, hoy).days
        return dias !== null && dias >= DIAS_FRENADA
      }).length,
    }
  }, [opportunities, hoy])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return opportunities.filter((opportunity) => {
      if (state === "active" && !ACTIVE_STAGES.includes(opportunity.stage)) return false
      if (state === "closed" && !CLOSED_STAGES.includes(opportunity.stage)) return false
      if (owner !== "all" && opportunity.owner?.full_name !== owner) return false
      if (service !== "all" && opportunity.service_type !== service) return false
      if (
        term &&
        !`${opportunity.title} ${opportunity.organization?.name ?? ""}`
          .toLowerCase()
          .includes(term)
      )
        return false
      if (foco === "sin-accion") {
        const estado = nextActionOf(
          opportunity.next_action,
          opportunity.next_action_date,
          hoy
        ).state
        if (estado !== "sin-definir") return false
      }
      if (foco === "frenadas") {
        const dias = stalenessOf(opportunity.last_movement_at, hoy).days
        if (dias === null || dias < DIAS_FRENADA) return false
      }
      return true
    })
  }, [opportunities, owner, query, service, state, foco, hoy])

  const visibleStages = OPPORTUNITY_STAGES.filter((stage) => {
    if (state === "active") return ACTIVE_STAGES.includes(stage)
    if (state === "closed") return CLOSED_STAGES.includes(stage)
    return true
  })

  const porEtapa = useMemo(() => {
    const mapa = new Map<Enums<"opportunity_stage">, OppCard[]>()
    for (const stage of visibleStages) mapa.set(stage, [])
    for (const opportunity of filtered) {
      mapa.get(opportunity.stage)?.push(opportunity)
    }
    return mapa
  }, [filtered, visibleStages])

  const counts = visibleStages.map((stage) => porEtapa.get(stage)?.length ?? 0)
  const widths = funnelWidths(counts)
  const shares = reachedShares(counts)
  const totalVisible = counts.reduce((sum, count) => sum + count, 0)

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

  function onDrop(stage: Enums<"opportunity_stage">) {
    setDropTarget(null)
    const id = dragging
    setDragging(null)
    if (!id) return
    const card = opportunities.find((o) => o.id === id)
    if (!card || card.stage === stage) return
    doMove(id, stage, card.title)
  }

  return (
    <>
      <SignalStrip
        valor={señales.valor}
        sinAccion={señales.sinAccion}
        frenadas={señales.frenadas}
        foco={foco}
        onFoco={setFoco}
      />

      <div className="mt-3 mb-4 grid gap-2 rounded-xl border bg-background p-3 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_12rem_13rem_11rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar oportunidad o empresa"
            className="pl-9"
            aria-label="Buscar oportunidades"
          />
        </div>
        {/*
          `items` no es opcional: sin ese mapa el disparador muestra el valor
          crudo ("all") en lugar de la etiqueta. Es una particularidad de los
          Select de base-ui que este repo ya arrastró antes.
        */}
        <Select
          value={owner}
          onValueChange={(value) => value && setOwner(value)}
          items={{
            all: "Todos los responsables",
            ...Object.fromEntries(owners.map((name) => [name, name])),
          }}
        >
          <SelectTrigger aria-label="Responsable">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los responsables</SelectItem>
            {owners.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={service}
          onValueChange={(value) => value && setService(value)}
          items={{ all: "Todos los servicios", ...SERVICE_TYPE_LABELS }}
        >
          <SelectTrigger aria-label="Área o servicio">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los servicios</SelectItem>
            {Object.entries(SERVICE_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={state}
          onValueChange={(value) => setState(value as typeof state)}
          items={{ active: "Activas", closed: "Cerradas", all: "Todas" }}
        >
          <SelectTrigger aria-label="Estado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Activas</SelectItem>
            <SelectItem value="closed">Cerradas</SelectItem>
            <SelectItem value="all">Todas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-stretch gap-1.5 overflow-x-auto pb-4">
        {visibleStages.map((stage, index) => (
          <StageColumn
            key={stage}
            stage={stage}
            cards={porEtapa.get(stage) ?? []}
            grow={widths[index]}
            share={shares[index]}
            position={index}
            stageCount={visibleStages.length}
            total={totalVisible}
            hoy={hoy}
            pending={pending}
            dragging={dragging}
            isDropTarget={dropTarget === stage}
            onDragEnterStage={() => setDropTarget(stage)}
            onDragLeaveStage={() => setDropTarget((s) => (s === stage ? null : s))}
            onDrop={() => onDrop(stage)}
            onDragStartCard={setDragging}
            onDragEndCard={() => {
              setDragging(null)
              setDropTarget(null)
            }}
            onMove={doMove}
          />
        ))}
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

// ------------------------------------------------------------- señales

/**
 * Tres números que se pueden accionar, no tres números para mirar.
 *
 * Los dos últimos son botones: filtran el tablero. Un contador de problemas
 * que no te lleva a los problemas obliga a buscarlos a mano, que es el trabajo
 * que la pantalla debería estar ahorrando.
 */
function SignalStrip({
  valor,
  sinAccion,
  frenadas,
  foco,
  onFoco,
}: {
  valor: string
  sinAccion: number
  frenadas: number
  foco: Foco
  onFoco: (foco: Foco) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="rounded-xl border bg-background px-3.5 py-2">
        <p className="label-mono text-muted-foreground">Valor activo</p>
        <p className="mt-0.5 font-heading text-lg leading-none font-semibold tracking-tight tabular-nums">
          {valor || "—"}
        </p>
      </div>

      <SignalButton
        label="Sin próxima acción"
        count={sinAccion}
        active={foco === "sin-accion"}
        onClick={() => onFoco(foco === "sin-accion" ? "todas" : "sin-accion")}
      />
      <SignalButton
        label={`Frenadas +${DIAS_FRENADA} días`}
        count={frenadas}
        active={foco === "frenadas"}
        onClick={() => onFoco(foco === "frenadas" ? "todas" : "frenadas")}
      />

      {foco !== "todas" && (
        <button
          type="button"
          onClick={() => onFoco("todas")}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
        >
          <X className="size-3" aria-hidden="true" />
          Quitar filtro
        </button>
      )}
    </div>
  )
}

function SignalButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  const limpio = count === 0
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={limpio}
      aria-pressed={active}
      className={cn(
        "rounded-xl border px-3.5 py-2 text-left transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "motion-reduce:transition-none",
        limpio && "cursor-default opacity-60",
        !limpio && !active && "bg-background hover:border-foreground/25",
        active && "border-foreground bg-foreground text-background"
      )}
    >
      <p
        className={cn(
          "label-mono",
          active ? "text-background/70" : "text-muted-foreground"
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 font-heading text-lg leading-none font-semibold tabular-nums",
          !active && !limpio && count > 0 && "text-destructive"
        )}
      >
        {count}
      </p>
    </button>
  )
}

// -------------------------------------------------------------- columna

function StageColumn({
  stage,
  cards,
  grow,
  share,
  position,
  stageCount,
  total,
  hoy,
  pending,
  dragging,
  isDropTarget,
  onDragEnterStage,
  onDragLeaveStage,
  onDrop,
  onDragStartCard,
  onDragEndCard,
  onMove,
}: {
  stage: Enums<"opportunity_stage">
  cards: OppCard[]
  grow: number
  share: number
  position: number
  stageCount: number
  total: number
  hoy: string
  pending: string | null
  dragging: string | null
  isDropTarget: boolean
  onDragEnterStage: () => void
  onDragLeaveStage: () => void
  onDrop: () => void
  onDragStartCard: (id: string) => void
  onDragEndCard: () => void
  onMove: (id: string, stage: Enums<"opportunity_stage">, title: string) => void
}) {
  /*
   * Un solo tono que se satura hacia el final del embudo, en vez de un color
   * por etapa. Una escala de un color dice "esto va avanzando"; siete colores
   * distintos sólo dicen "acá hay siete cosas".
   */
  const avance = stageCount > 1 ? position / (stageCount - 1) : 1
  const intensidad = 0.3 + avance * 0.7

  return (
    <section
      style={{ flexGrow: grow }}
      onDragOver={(event) => {
        if (!dragging) return
        event.preventDefault()
        onDragEnterStage()
      }}
      onDragLeave={onDragLeaveStage}
      onDrop={(event) => {
        event.preventDefault()
        onDrop()
      }}
      className="flex min-w-28 shrink-0 basis-0 flex-col"
      aria-label={`${STAGE_LABELS[stage]}: ${cards.length} oportunidades`}
    >
      <header className="relative overflow-hidden rounded-t-xl bg-[#14130F] px-3 pt-3 pb-2.5 text-[#FBF9F4]">
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-0.5 bg-primary"
          style={{ opacity: intensidad }}
        />
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="label-mono truncate text-[#FBF9F4]/70">
            {STAGE_LABELS[stage]}
          </h3>
          <span className="font-heading text-xl leading-none font-semibold tabular-nums">
            {cards.length}
          </span>
        </div>
        <p
          className="mt-1.5 label-mono text-[#FBF9F4]/45"
          title={`${share}% de las ${total} oportunidades visibles están en esta etapa o más adelante. Es la foto de hoy, no una tasa de conversión.`}
        >
          {total > 0 ? `${share}% acá o más adelante` : "Sin oportunidades"}
        </p>
      </header>

      <div
        className={cn(
          "flex flex-1 flex-col gap-1.5 rounded-b-xl border border-t-0 p-1.5 transition-colors",
          "motion-reduce:transition-none",
          isDropTarget ? "border-primary bg-primary/8" : "bg-muted/30"
        )}
      >
        {cards.map((card) => (
          <OpportunityCard
            key={card.id}
            card={card}
            hoy={hoy}
            pending={pending === card.id}
            isDragging={dragging === card.id}
            onDragStart={() => onDragStartCard(card.id)}
            onDragEnd={onDragEndCard}
            onMove={(next) => onMove(card.id, next, card.title)}
          />
        ))}

        {cards.length === 0 && (
          <p className="px-2 py-6 text-center text-xs leading-relaxed text-muted-foreground/70">
            {isDropTarget ? "Soltá acá" : "Vacía"}
          </p>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- ficha

const STALENESS_STYLE: Record<Staleness["level"], string> = {
  hoy: "bg-success/12 text-success",
  reciente: "bg-muted text-muted-foreground",
  tibio: "bg-warning/30 text-foreground",
  frio: "bg-destructive/10 text-destructive",
  helado: "bg-destructive text-background",
  "sin-registro": "bg-muted text-muted-foreground",
}

function OpportunityCard({
  card,
  hoy,
  pending,
  isDragging,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  card: OppCard
  hoy: string
  pending: boolean
  isDragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onMove: (stage: Enums<"opportunity_stage">) => void
}) {
  const antiguedad = stalenessOf(card.last_movement_at, hoy)
  const accion = nextActionOf(card.next_action, card.next_action_date, hoy)
  const alerta = accion.state === "vencida" || accion.state === "sin-definir"

  return (
    <article
      draggable={!pending}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move"
        // Firefox no inicia el arrastre si no se escribe algo en el portapapeles.
        event.dataTransfer.setData("text/plain", card.id)
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "group cursor-grab rounded-lg border bg-card p-2.5 shadow-sm transition",
        "hover:border-foreground/20 hover:shadow-md active:cursor-grabbing",
        "motion-reduce:transition-none",
        pending && "pointer-events-none opacity-50",
        isDragging && "opacity-40"
      )}
    >
      <div className="flex items-start justify-between gap-1.5">
        <Link
          href={`/oportunidades/${card.id}`}
          className="line-clamp-2 text-sm leading-snug font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {card.title}
        </Link>
        <MoveMenu current={card.stage} onMove={onMove} />
      </div>

      {card.organization?.name && (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {card.organization.name}
        </p>
      )}

      {card.estimated_value !== null && card.estimated_value > 0 && (
        <p className="mt-1.5 font-heading text-base leading-none font-semibold tracking-tight tabular-nums">
          {formatMoney(card.estimated_value, card.currency)}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span
          className={cn(
            "label-mono inline-flex items-center gap-1 rounded px-1.5 py-0.5",
            STALENESS_STYLE[antiguedad.level]
          )}
          title="Última actividad registrada o última edición de la oportunidad"
        >
          <Clock className="size-2.5" aria-hidden="true" />
          {antiguedad.label}
        </span>
        {card.service_type && (
          <span className="label-mono rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
            {SERVICE_TYPE_LABELS[card.service_type]}
          </span>
        )}
      </div>

      <div
        className={cn(
          "mt-2 flex items-center gap-1 border-t pt-2 text-xs",
          alerta ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {alerta && <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />}
        <span className="truncate">{accion.label}</span>
        {card.next_action_date && accion.state !== "sin-definir" && (
          <span className="ml-auto shrink-0 tabular-nums">
            {formatDateShort(card.next_action_date)}
          </span>
        )}
      </div>

      {card.owner?.full_name && (
        <p className="mt-1.5 truncate text-right text-[11px] text-muted-foreground/70">
          {card.owner.full_name}
        </p>
      )}
    </article>
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
      {/*
        Se revela al pasar el mouse pero también con el foco: arrastrar no es
        alcanzable con teclado, así que este menú es el único camino accesible
        para mover una ficha y no puede depender del hover.
      */}
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Mover ${STAGE_LABELS[current]}`}
            className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          />
        }
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/*
          El label va dentro de un Group a propósito: base-ui lo implementa
          como `Menu.GroupLabel` y lanza un error en tiempo de ejecución si no
          encuentra el contexto del grupo. Suelto dentro del contenido, abrir
          el menú tiraba la página entera abajo.
        */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Mover a</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {OPPORTUNITY_STAGES.filter((s) => s !== current).map((s) => (
            <DropdownMenuItem key={s} onClick={() => onMove(s)}>
              {STAGE_LABELS[s]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
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
