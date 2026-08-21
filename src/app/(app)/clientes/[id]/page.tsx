import Link from "next/link"
import { notFound } from "next/navigation"
import {
  Activity,
  ArrowLeft,
  BriefcaseBusiness,
  CircleDollarSign,
  ExternalLink,
  FileText,
  Link2,
  MessageSquare,
} from "lucide-react"
import {
  ClientArchiveControl,
  ClientConversationPanel,
  ClientEditForm,
  ContactManager,
} from "@/components/clients/client-editors"
import { ProjectStatusBadge } from "@/components/project-badges"
import { StageBadge } from "@/components/stage-badge"
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ACTIVE_STAGES,
  CLIENT_STATUS_LABELS,
  FINANCIAL_STATUS_LABELS,
  PROJECT_AREA_LABELS,
  type FinancialRecordType,
  type ProjectArea,
  type SupportedCurrency,
} from "@/lib/constants"
import {
  financialBalance,
  financialStatus,
  summarizeFinances,
} from "@/lib/finance"
import { formatDate, formatMoney, todayISO } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

const TABS = [
  ["resumen", "Resumen", FileText],
  ["proyectos", "Proyectos", BriefcaseBusiness],
  ["actividad", "Actividad", Activity],
  ["conversacion", "Conversación", MessageSquare],
  ["finanzas", "Finanzas", CircleDollarSign],
  ["enlaces", "Enlaces", Link2],
] as const

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab = "resumen" } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let { data: client } = await supabase
    .from("clients")
    .select(
      `id, status, start_date, notes, organization_id, owner_id,
       archived_at, archive_reason,
       owner:profiles!clients_owner_id_fkey(full_name),
       organization:organizations(id, name, domain, website, industry, size, country, city, linkedin, notes)`
    )
    .eq("id", id)
    .limit(1)
    .maybeSingle()

  if (!client) {
    const result = await supabase
      .from("clients")
      .select(
        `id, status, start_date, notes, organization_id, owner_id,
         archived_at, archive_reason,
         owner:profiles!clients_owner_id_fkey(full_name),
         organization:organizations(id, name, domain, website, industry, size, country, city, linkedin, notes)`
      )
      .eq("organization_id", id)
      .limit(1)
      .maybeSingle()
    client = result.data
  }
  if (!client?.organization) notFound()
  const organization = client.organization

  const [
    contactsRes,
    projectsRes,
    opportunitiesRes,
    financeRes,
    conversationsRes,
    profilesRes,
    currentProfileRes,
  ] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, full_name, title, email, phone, linkedin, notes")
      .eq("organization_id", organization.id)
      .order("full_name"),
    supabase
      .from("projects")
      .select(
        "id, name, area, engagement_kind, operational_type, status, due_date, links, archived_at"
      )
      .eq("client_id", client.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("opportunities")
      .select(
        "id, title, stage, estimated_value, currency, next_action, next_action_date, created_at"
      )
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("financial_records")
      .select(
        "id, record_type, concept, currency, total_amount, paid_amount, due_date, paid_at, canceled_at, project_id, created_at"
      )
      .eq("client_id", client.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("conversations")
      .select("id, title, status, last_message_at")
      .eq("client_id", client.id)
      .order("last_message_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name").order("full_name"),
    user
      ? supabase.from("profiles").select("role").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
  ])

  const projects = projectsRes.data ?? []
  const opportunities = opportunitiesRes.data ?? []
  const projectIds = projects.map((project) => project.id)
  const opportunityIds = opportunities.map((opportunity) => opportunity.id)
  const activityQueries = []
  if (projectIds.length > 0) {
    activityQueries.push(
      supabase
        .from("activities")
        .select(
          "id, type, body, due_date, completed, created_at, project_id, opportunity_id"
        )
        .in("project_id", projectIds)
    )
  }
  if (opportunityIds.length > 0) {
    activityQueries.push(
      supabase
        .from("activities")
        .select(
          "id, type, body, due_date, completed, created_at, project_id, opportunity_id"
        )
        .in("opportunity_id", opportunityIds)
    )
  }
  const activityResults = await Promise.all(activityQueries)
  const activityMap = new Map(
    activityResults
      .flatMap((result) => result.data ?? [])
      .map((activityItem) => [activityItem.id, activityItem])
  )
  const activities = [...activityMap.values()].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  )

  const today = todayISO()
  const finances = (financeRes.data ?? []).map((record) => ({
    ...record,
    record_type: record.record_type as FinancialRecordType,
    currency: record.currency as SupportedCurrency,
  }))
  const financeSummary = summarizeFinances(finances, today)
  const nextAction = opportunities
    .filter((opportunity) => ACTIVE_STAGES.includes(opportunity.stage))
    .sort((a, b) =>
      (a.next_action_date ?? "9999").localeCompare(
        b.next_action_date ?? "9999"
      )
    )[0]

  const links: { label: string; url: string; project?: string }[] = []
  if (organization.website)
    links.push({
      label: "Sitio web",
      url: externalUrl(organization.website),
    })
  if (organization.linkedin)
    links.push({
      label: "LinkedIn",
      url: externalUrl(organization.linkedin),
    })
  for (const project of projects) {
    const projectLinks = (project.links ?? {}) as Record<string, unknown>
    for (const [label, value] of Object.entries(projectLinks)) {
      if (typeof value === "string" && /^https?:\/\//.test(value)) {
        links.push({ label, url: value, project: project.name })
      }
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] p-4 sm:p-6">
      <Link
        href="/clientes"
        className="label-mono inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" /> Volver a clientes
      </Link>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-[-0.035em]">
              {organization.name}
            </h1>
            <Badge variant="secondary">
              {CLIENT_STATUS_LABELS[client.status]}
            </Badge>
            {client.archived_at && <Badge variant="outline">Archivado</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Responsable: {client.owner?.full_name ?? "Sin asignar"} · desde{" "}
            {formatDate(client.start_date)}
          </p>
        </div>
        {nextAction && (
          <Link
            href={`/oportunidades/${nextAction.id}`}
            className="rounded-xl border bg-card px-4 py-3 text-sm shadow-sm hover:bg-muted/40"
          >
            <span className="label-mono text-primary">Próxima acción</span>
            <span className="mt-1 block font-medium">
              {nextAction.next_action || "Definir acción"} ·{" "}
              {formatDate(nextAction.next_action_date)}
            </span>
          </Link>
        )}
      </div>

      <nav className="mt-6 flex gap-1 overflow-x-auto rounded-xl border bg-card p-1">
        {TABS.map(([value, label, Icon]) => (
          <Link
            key={value}
            href={`/clientes/${client.id}?tab=${value}`}
            className={cn(
              "inline-flex min-w-max items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
              tab === value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-4" /> {label}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {tab === "proyectos" ? (
          <Projects projects={projects} />
        ) : tab === "actividad" ? (
          <ActivityHistory
            activities={activities}
            opportunities={opportunities}
          />
        ) : tab === "conversacion" ? (
          <ClientConversationPanel
            clientId={client.id}
            conversations={conversationsRes.data ?? []}
            profiles={profilesRes.data ?? []}
          />
        ) : tab === "finanzas" ? (
          <Finances
            finances={finances}
            summary={financeSummary}
            today={today}
          />
        ) : tab === "enlaces" ? (
          <Links links={links} />
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(22rem,1fr)]">
            <ClientEditForm
              client={{
                ...client,
                organization,
              }}
              profiles={profilesRes.data ?? []}
            />
            <div className="space-y-5">
              <ContactManager
                clientId={client.id}
                organizationId={organization.id}
                contacts={contactsRes.data ?? []}
              />
              <ClientArchiveControl
                clientId={client.id}
                archived={!!client.archived_at}
                isAdmin={currentProfileRes.data?.role === "admin"}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Projects({
  projects,
}: {
  projects: {
    id: string
    name: string
    area: string
    operational_type: string | null
    status: Parameters<typeof ProjectStatusBadge>[0]["status"]
    due_date: string | null
    archived_at: string | null
  }[]
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      {projects.length === 0 ? (
        <Empty>Este cliente todavía no tiene proyectos.</Empty>
      ) : (
        projects.map((project) => (
          <Link
            key={project.id}
            href={`/proyectos/${project.id}`}
            className="flex flex-col gap-2 border-b px-5 py-4 hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-heading text-sm font-semibold">
                {project.name}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {PROJECT_AREA_LABELS[project.area as ProjectArea]}
                {project.operational_type &&
                  ` · ${project.operational_type}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {formatDate(project.due_date)}
              </span>
              <ProjectStatusBadge status={project.status} />
            </div>
          </Link>
        ))
      )}
    </Card>
  )
}

function ActivityHistory({
  activities,
  opportunities,
}: {
  activities: {
    id: string
    body: string | null
    type: string
    due_date: string | null
    created_at: string
  }[]
  opportunities: {
    id: string
    title: string
    stage: Parameters<typeof StageBadge>[0]["stage"]
    estimated_value: number | null
    currency: string
  }[]
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">Actividad</CardTitle>
        </CardHeader>
        {activities.length === 0 ? (
          <Empty>Sin actividad registrada.</Empty>
        ) : (
          activities.map((item) => (
            <div key={item.id} className="border-b px-5 py-4">
              <p className="text-sm">{item.body || "Actividad sin detalle"}</p>
              <p className="label-mono mt-1 text-muted-foreground">
                {item.type} · {formatDate(item.due_date ?? item.created_at)}
              </p>
            </div>
          ))
        )}
      </Card>
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">Oportunidades</CardTitle>
        </CardHeader>
        {opportunities.map((opportunity) => (
          <Link
            key={opportunity.id}
            href={`/oportunidades/${opportunity.id}`}
            className="flex items-center justify-between gap-3 border-b px-5 py-4 hover:bg-muted/40"
          >
            <div>
              <p className="text-sm font-medium">{opportunity.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatMoney(
                  opportunity.estimated_value,
                  opportunity.currency
                )}
              </p>
            </div>
            <StageBadge stage={opportunity.stage} />
          </Link>
        ))}
      </Card>
    </div>
  )
}

function Finances({
  finances,
  summary,
  today,
}: {
  finances: Array<
    Parameters<typeof financialStatus>[0] & {
      id: string
      concept: string
    }
  >
  summary: ReturnType<typeof summarizeFinances>
  today: string
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MoneyStat
          label="Cobrado"
          ars={summary.collectedThisMonth.ARS}
          usd={summary.collectedThisMonth.USD}
        />
        <MoneyStat
          label="Pendiente"
          ars={summary.pending.ARS}
          usd={summary.pending.USD}
        />
        <MoneyStat
          label="Vencido"
          ars={summary.overdue.ARS}
          usd={summary.overdue.USD}
          danger
        />
        <MoneyStat
          label="Gastos"
          ars={summary.expensesThisMonth.ARS}
          usd={summary.expensesThisMonth.USD}
        />
      </div>
      <Card className="gap-0 overflow-hidden py-0">
        {finances.length === 0 ? (
          <Empty>Sin registros financieros.</Empty>
        ) : (
          finances.map((record) => {
            const status = financialStatus(record, today)
            return (
              <div
                key={record.id}
                className="flex items-center justify-between gap-3 border-b px-5 py-4 text-sm"
              >
                <div>
                  <p>{record.concept}</p>
                  <p className="label-mono mt-1 text-muted-foreground">
                    {FINANCIAL_STATUS_LABELS[status]}
                  </p>
                </div>
                <span
                  className={
                    status === "overdue"
                      ? "font-mono text-destructive"
                      : "font-mono"
                  }
                >
                  {formatMoney(
                    financialBalance(record),
                    record.currency
                  )}
                </span>
              </div>
            )
          })
        )}
      </Card>
    </div>
  )
}

function Links({
  links,
}: {
  links: { label: string; url: string; project?: string }[]
}) {
  return (
    <Card className="max-w-3xl gap-0 overflow-hidden py-0">
      {links.length === 0 ? (
        <Empty>Sin enlaces cargados.</Empty>
      ) : (
        links.map((link, index) => (
          <a
            key={`${link.url}-${index}`}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-3 border-b px-5 py-4 text-sm hover:bg-muted/40"
          >
            <span>
              {link.project
                ? `${link.project} · ${link.label}`
                : link.label}
            </span>
            <ExternalLink className="size-4 text-muted-foreground" />
          </a>
        ))
      )}
    </Card>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-5 rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

function MoneyStat({
  label,
  ars,
  usd,
  danger = false,
}: {
  label: string
  ars: number
  usd: number
  danger?: boolean
}) {
  return (
    <Card className="gap-0 p-4">
      <p className="label-mono text-muted-foreground">{label}</p>
      <div
        className={`mt-3 font-mono text-sm font-semibold ${
          danger && (ars > 0 || usd > 0) ? "text-destructive" : ""
        }`}
      >
        <p>{formatMoney(ars, "ARS")}</p>
        <p className="mt-1">{formatMoney(usd, "USD")}</p>
      </div>
    </Card>
  )
}

function externalUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}
