import Link from "next/link"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { PROJECT_STATUS_LABELS } from "@/lib/constants"
import { formatDateShort } from "@/lib/format"
import type { DashboardClient } from "@/lib/dashboard/queries"
import { EmptyLine } from "@/components/dashboard/section"

/**
 * Vista compacta: quién es, qué se le está haciendo y cuándo entrega. Los
 * datos administrativos viven en Clientes, no acá.
 */
export function ActiveClients({
  clients,
  today,
}: {
  clients: DashboardClient[]
  today: string
}) {
  if (clients.length === 0) {
    return <EmptyLine>Todavía no hay clientes activos.</EmptyLine>
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      {clients.map((client, index) => {
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="truncate text-sm font-medium">{client.name}</h3>
              {client.nextDelivery && (
                <span
                  className={cn(
                    "shrink-0 font-mono text-xs tabular-nums",
                    client.nextDelivery.dueDate < today
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                >
                  {formatDateShort(client.nextDelivery.dueDate)}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {client.projects.length > 0
                ? client.projects
                    .map((p) => `${p.name} (${PROJECT_STATUS_LABELS[p.status]})`)
                    .join(" · ")
                : "Sin proyectos en curso"}
            </p>
            {client.ownerName && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Responsable: {client.ownerName}
              </p>
            )}
          </>
        )

        const className = cn(
          "block px-4 py-3",
          index > 0 && "border-t",
          "transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        )

        return (
          <Link key={client.id} href={`/clientes/${client.id}`} className={className}>
            {body}
          </Link>
        )
      })}
    </Card>
  )
}
