import Link from "next/link"
import {
  ArrowRight,
  CircleDollarSign,
  Search,
  UsersRound,
} from "lucide-react"
import { ClientCreateDialog } from "@/components/clients/client-create-dialog"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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
import { createClient } from "@/lib/supabase/server"

type FinanceState = "up_to_date" | "pending" | "overdue" | "none"
const FINANCE_LABEL: Record<FinanceState, string> = {
  up_to_date: "Al día",
  pending: "Pendiente",
  overdue: "Vencido",
  none: "Sin registros",
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    status?: string
    owner?: string
    archived?: string
  }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const [clientsRes, financeRes, profilesRes, organizationsRes] =
    await Promise.all([
      supabase
        .from("clients")
        .select(
          `id, status, notes, archived_at, archive_reason, owner_id,
           owner:profiles!clients_owner_id_fkey(full_name),
           organization:organizations(
             id, name, domain,
             contacts(id, full_name, email, phone),
             opportunities(id, title, stage, next_action, next_action_date)
           ),
           projects(id, name, area, status, due_date)`
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("financial_records")
        .select(
          "id, client_id, record_type, currency, total_amount, paid_amount, due_date, paid_at, canceled_at"
        ),
      supabase.from("profiles").select("id, full_name").order("full_name"),
      supabase.from("organizations").select("id, name").order("name"),
    ])

  const today = todayISO()
  const finances = financeRes.data ?? []
  const allClients = (clientsRes.data ?? []).map((client) => {
    const projects = (client.projects ?? []).filter((project) =>
      ACTIVE_PROJECT_STATUSES.includes(project.status)
    )
    const areas = [
      ...new Set(projects.map((project) => project.area as ProjectArea)),
    ]
    const opportunities = (client.organization?.opportunities ?? [])
      .filter((opportunity) => ACTIVE_STAGES.includes(opportunity.stage))
      .sort((a, b) => {
        if (!a.next_action_date) return 1
        if (!b.next_action_date) return -1
        return a.next_action_date.localeCompare(b.next_action_date)
      })
    const income = finances.filter(
      (record) =>
        record.client_id === client.id && record.record_type === "income"
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
      : statuses.some(
            (status) => status === "pending" || status === "partial"
          )
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

  const query = params.q?.trim().toLocaleLowerCase("es") ?? ""
  const clients = allClients.filter((client) => {
    const archivedFilter = params.archived ?? "active"
    if (archivedFilter === "active" && client.archived_at) return false
    if (archivedFilter === "archived" && !client.archived_at) return false
    if (params.status && params.status !== "all" && client.status !== params.status)
      return false
    if (params.owner && params.owner !== "all" && client.owner_id !== params.owner)
      return false
    if (query) {
      const searchable = [
        client.organization?.name,
        client.organization?.domain,
        client.mainContact?.full_name,
        client.mainContact?.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("es")
      if (!searchable.includes(query)) return false
    }
    return true
  })

  return (
    <div className="mx-auto w-full max-w-[1500px] p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="label-mono text-primary">Relaciones</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">
            Clientes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {clients.length} de {allClients.length} clientes · datos, contactos,
            proyectos, conversaciones y cobros.
          </p>
        </div>
        <ClientCreateDialog
          organizations={organizationsRes.data ?? []}
          profiles={profilesRes.data ?? []}
        />
      </div>

      <form className="mt-6 grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_11rem_12rem_11rem_auto]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={params.q}
            placeholder="Buscar empresa o contacto"
            className="pl-9"
          />
        </label>
        <select
          name="status"
          defaultValue={params.status ?? "all"}
          className="h-9 rounded-lg border bg-transparent px-3 text-sm"
        >
          <option value="all">Todos los estados</option>
          {Object.entries(CLIENT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="owner"
          defaultValue={params.owner ?? "all"}
          className="h-9 rounded-lg border bg-transparent px-3 text-sm"
        >
          <option value="all">Todo el equipo</option>
          {(profilesRes.data ?? []).map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.full_name}
            </option>
          ))}
        </select>
        <select
          name="archived"
          defaultValue={params.archived ?? "active"}
          className="h-9 rounded-lg border bg-transparent px-3 text-sm"
        >
          <option value="active">Activos</option>
          <option value="archived">Archivados</option>
          <option value="all">Todos</option>
        </select>
        <button className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
          Filtrar
        </button>
      </form>

      {clients.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed px-4 py-16 text-center">
          <UsersRound className="mx-auto size-8 text-muted-foreground/50" />
          <p className="mt-3 font-heading text-sm font-semibold">
            No hay clientes con esos filtros
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ajustá la búsqueda o creá el primer cliente.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-3 xl:grid-cols-2">
          {clients.map((client) => (
            <Link
              key={client.id}
              href={`/clientes/${client.id}`}
              className="group rounded-xl outline-none"
            >
              <Card className="h-full gap-0 overflow-hidden py-0 transition-all group-hover:-translate-y-0.5 group-hover:shadow-md group-focus-visible:ring-3 group-focus-visible:ring-ring/50 motion-reduce:group-hover:translate-y-0">
                <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-heading text-base font-semibold">
                        {client.organization?.name ?? "Cliente sin organización"}
                      </h2>
                      <Badge variant="secondary">
                        {CLIENT_STATUS_LABELS[client.status]}
                      </Badge>
                      {client.archived_at && (
                        <Badge variant="outline">Archivado</Badge>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {client.mainContact?.full_name ?? "Sin contacto principal"}
                      {client.owner?.full_name &&
                        ` · Responsable: ${client.owner.full_name}`}
                    </p>
                  </div>
                  <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>

                <div className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <p className="label-mono text-muted-foreground">
                      Trabajo activo
                    </p>
                    <p className="mt-1 truncate text-sm">
                      {client.projects.length > 0
                        ? client.projects
                            .map((project) => project.name)
                            .join(" · ")
                        : "Sin proyectos activos"}
                    </p>
                    {client.areas.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {client.areas.map((area) => (
                          <span
                            key={area}
                            className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                          >
                            {PROJECT_AREA_LABELS[area]}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="sm:min-w-36 sm:border-l sm:pl-4">
                    <p className="label-mono flex items-center gap-1.5 text-muted-foreground">
                      <CircleDollarSign className="size-3" /> Cobros
                    </p>
                    <p
                      className={`mt-1 text-sm font-medium ${
                        client.financeState === "overdue"
                          ? "text-destructive"
                          : ""
                      }`}
                    >
                      {FINANCE_LABEL[client.financeState]}
                    </p>
                  </div>
                </div>

                <div className="border-t px-5 py-3 text-xs text-muted-foreground">
                  {client.nextAction ? (
                    <span>
                      Próximo:{" "}
                      {client.nextAction.next_action ||
                        "Definir próxima acción"}
                      {client.nextAction.next_action_date &&
                        ` · ${formatDateShort(
                          client.nextAction.next_action_date
                        )}`}
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
  )
}
