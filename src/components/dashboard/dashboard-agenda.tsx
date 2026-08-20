import Link from "next/link"
import { CalendarCheck, Flag, ListChecks, Phone, Users } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { formatDateShort } from "@/lib/format"
import type { AgendaGroups, AgendaItem, AgendaKind } from "@/lib/dashboard/utils"

const KIND: Record<AgendaKind, { icon: React.ElementType; label: string }> = {
  reunion: { icon: Users, label: "Reunión" },
  llamada: { icon: Phone, label: "Llamada" },
  seguimiento: { icon: CalendarCheck, label: "Seguimiento" },
  tarea: { icon: ListChecks, label: "Tarea" },
  entrega: { icon: Flag, label: "Entrega" },
}

const GROUPS: { key: keyof AgendaGroups; label: string }[] = [
  { key: "hoy", label: "Hoy" },
  { key: "manana", label: "Mañana" },
  { key: "semana", label: "Próximos 7 días" },
]

/** Máximo de ítems por grupo: la agenda tiene que leerse de un vistazo. */
const PER_GROUP = 5

export function DashboardAgenda({ agenda }: { agenda: AgendaGroups }) {
  const total = agenda.hoy.length + agenda.manana.length + agenda.semana.length

  if (total === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        No hay nada agendado para los próximos días.
      </p>
    )
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      {GROUPS.filter(({ key }) => agenda[key].length > 0).map(
        ({ key, label }, groupIndex) => {
          const items = agenda[key]
          const hidden = items.length - PER_GROUP
          return (
            <div key={key} className={cn(groupIndex > 0 && "border-t")}>
              <h3 className="bg-muted/40 px-4 py-1.5 font-mono text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                {label}
                <span className="ml-1.5 tabular-nums">{items.length}</span>
              </h3>
              <ul className="divide-y">
                {items.slice(0, PER_GROUP).map((item) => (
                  <AgendaRow key={item.id} item={item} />
                ))}
              </ul>
              {hidden > 0 && (
                <p className="px-4 py-2 text-xs text-muted-foreground">
                  +{hidden} más
                </p>
              )}
            </div>
          )
        }
      )}
    </Card>
  )
}

function AgendaRow({ item }: { item: AgendaItem }) {
  const { icon: Icon, label } = KIND[item.kind]

  const content = (
    <>
      <Icon
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{item.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {/* El tipo se nombra, no se deja sólo al icono. */}
          {label}
          {item.context && ` · ${item.context}`}
        </p>
      </div>
      <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
        {formatDateShort(item.date)}
      </span>
    </>
  )

  return (
    <li>
      {item.href ? (
        <Link
          href={item.href}
          className="flex items-start gap-2.5 px-4 py-2.5 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          {content}
        </Link>
      ) : (
        <div className="flex items-start gap-2.5 px-4 py-2.5">{content}</div>
      )}
    </li>
  )
}
