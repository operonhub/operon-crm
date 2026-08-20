import Link from "next/link"
import { ArrowRight, CircleDollarSign, UsersRound } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  ACTIVE_PROJECT_STATUSES,
  ACTIVE_STAGES,
  CLIENT_STATUS_LABELS,
  PROJECT_AREA_LABELS,
  type ProjectArea,
  type SupportedCurrency,
} from "@/lib/constants"
import { financialStatus } from "@/lib/finance"
import { formatDateShort, todayISO } from "@/lib/format"

type FinanceState = "up_to_date" | "pending" | "overdue" | "none"

const FINANCE_LABEL: Record<FinanceState, string> = {
  up_to_date: "Al día",
  pending: "Pendiente",
  overdue: "Vencido",
  none: "Sin registros",
}

export default async function ClientesPage() {
  const supabase = await createClient()
  const [clientsRes, financeRes] = await Promise.all([
    supabase
      .from("clients")
      .select(
        `id, status, notes,
         owner:profiles!clients_owner_id_fkey(full_name),
         organization:organizations(
           id, name, domain,
           contacts(id, full_name, email, phone),
           opportunities(id, title, stage, next_action, next_action_date)
         ),
         projects(id, name, area, status, due_date)`
      )
      .order("created_at", { ascending: false }),
    supabase.from("financial_records").select(
      "id, client_id, record_type, currency, total_amount, paid_amount, due_date, paid_at, canceled_at"
    ),
  ])

  const today = todayISO()
  const finances = financeRes.data ?? []
  const clients = (clientsRes.data ?? []).map((client) => {
    const projects = (client.projects ?? []).filter((project) =>
      ACTIVE_PROJECT_STATUSES.includes(project.status)
    )
    const areas = [...new Set(projects.map((project) => project.area as ProjectArea))]
    const opportunities = (client.organization?.opportunities ?? [])
      .filter((opp) => ACTIVE_STAGES.includes(opp.stage))
      .sort((a, b) => {
        if (!a.next_action_date) return 1
        if (!b.next_action_date) return -1
        return a.next_action_date.localeCompare(b.next_action_date)
      })
    const income = finances.filter(
      (record) => record.client_id === client.id && record.record_type === "income"
    )
    const statuses = income.map((record) =>
      financialStatus(
        {
          ...record,
          record_type: "income",
          currency: record.currency as SupportedCurrency,
        },
        today
      )
    )
    const financeState: FinanceState = statuses.includes("overdue")
      ? "overdue"
      : statuses.some((status) => status === "pending" || status === "partial")
        ? "pending"
        : statuses.length > 0
          ? "up_to_date"
          : "none"

    return {
      ...client,
      projects,
      areas,
      mainContact: client.organization?.contacts?.[0] ?? null,
      nextAction: opportunities[0] ?? null,
      financeState,
    }
  })

  return (
    <>
      <PageHeader
        title="Clientes"
        description={`${clients.length} cliente${clients.length === 1 ? "" : "s"} · operación, proyectos y cobros`}
      />
      <div className="space-y-4 p-4 sm:p-6">
        {financeRes.error && (
          <p role="status" className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            El estado financiero estará disponible al aplicar la migración operativa.
          </p>
        )}

        {clients.length === 0 ? (
          <div className="rounded-xl border border-dashed px-4 py-12 text-center">
            <UsersRound className="mx-auto h-5 w-5 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Todavía no hay clientes.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Una empresa o prospecto pasa a cliente al ganar una oportunidad o desde Crear en Hoy.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {clients.map((client) => (
              <Link key={client.id} href={`/clientes/${client.id}`} className="group">
                <Card className="h-full gap-0 p-0 transition-colors group-hover:bg-muted/30">
                  <div className="flex items-start justify-between gap-4 border-b px-4 py-3.5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-sm font-semibold">
                          {client.organization?.name ?? "Cliente sin organización"}
                        </h2>
                        <Badge variant="secondary">
                          {CLIENT_STATUS_LABELS[client.status]}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {client.mainContact?.full_name ?? "Sin contacto principal"}
                        {client.owner?.full_name && ` · Responsable: ${client.owner.full_name}`}
                      </p>
                    </div>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>

                  <div className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto]">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                        Trabajo activo
                      </p>
                      <p className="mt-1 truncate text-sm">
                        {client.projects.length > 0
                          ? client.projects.map((project) => project.name).join(" · ")
                          : "Sin proyectos activos"}
                      </p>
                      {client.areas.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {client.areas.map((area) => (
                            <span key={area} className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                              {PROJECT_AREA_LABELS[area]}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="sm:min-w-36 sm:border-l sm:pl-4">
                      <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                        <CircleDollarSign className="h-3 w-3" /> Cobros
                      </p>
                      <p className={`mt-1 text-sm font-medium ${client.financeState === "overdue" ? "text-destructive" : ""}`}>
                        {FINANCE_LABEL[client.financeState]}
                      </p>
                    </div>
                  </div>

                  <div className="border-t px-4 py-2.5 text-xs text-muted-foreground">
                    {client.nextAction ? (
                      <span>
                        Próximo: {client.nextAction.next_action || "Definir próxima acción"}
                        {client.nextAction.next_action_date && ` · ${formatDateShort(client.nextAction.next_action_date)}`}
                      </span>
                    ) : (
                      <span>Sin seguimiento comercial pendiente</span>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
