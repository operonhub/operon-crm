import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  ExternalLink,
  Mail,
  Phone,
} from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { ProjectStatusBadge } from "@/components/project-badges"
import { StageBadge } from "@/components/stage-badge"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

export default async function ClienteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  let { data: client } = await supabase
    .from("clients")
    .select(
      `id, status, start_date, notes, organization_id,
       owner:profiles!clients_owner_id_fkey(full_name),
       organization:organizations(id, name, domain, website, industry, size, country, city, linkedin, notes)`
    )
    .eq("id", id)
    .limit(1)
    .maybeSingle()

  // Compatibilidad: las rutas históricas usaban el UUID de organization.
  if (!client) {
    const result = await supabase
      .from("clients")
      .select(
        `id, status, start_date, notes, organization_id,
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

  const [contactsRes, projectsRes, oppsRes, leadsRes, financeRes] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, full_name, title, email, phone")
      .eq("organization_id", organization.id)
      .order("full_name"),
    supabase
      .from("projects")
      .select("id, name, area, engagement_kind, operational_type, status, due_date, links")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("opportunities")
      .select("id, title, stage, estimated_value, currency, next_action, next_action_date, created_at")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("leads")
      .select("id, status, source, created_at")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("financial_records")
      .select("id, record_type, concept, currency, total_amount, paid_amount, due_date, paid_at, canceled_at, project_id, created_at")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false }),
  ])

  const projects = projectsRes.data ?? []
  const opportunities = oppsRes.data ?? []
  const projectIds = projects.map((project) => project.id)
  const opportunityIds = opportunities.map((opportunity) => opportunity.id)
  const activityQueries = []
  if (projectIds.length > 0) {
    activityQueries.push(
      supabase
        .from("activities")
        .select("id, type, body, due_date, completed, created_at, project_id, opportunity_id")
        .in("project_id", projectIds)
    )
  }
  if (opportunityIds.length > 0) {
    activityQueries.push(
      supabase
        .from("activities")
        .select("id, type, body, due_date, completed, created_at, project_id, opportunity_id")
        .in("opportunity_id", opportunityIds)
    )
  }
  const activityResults = await Promise.all(activityQueries)
  const activityMap = new Map(
    activityResults.flatMap((result) => result.data ?? []).map((activity) => [activity.id, activity])
  )
  const activities = [...activityMap.values()].sort((a, b) => b.created_at.localeCompare(a.created_at))

  const today = todayISO()
  const finances = (financeRes.data ?? []).map((record) => ({
    ...record,
    record_type: record.record_type as FinancialRecordType,
    currency: record.currency as SupportedCurrency,
  }))
  const financeSummary = summarizeFinances(finances, today)
  const nextAction = opportunities
    .filter((opportunity) => ACTIVE_STAGES.includes(opportunity.stage))
    .sort((a, b) => (a.next_action_date ?? "9999").localeCompare(b.next_action_date ?? "9999"))[0]

  const links: { label: string; url: string; project?: string }[] = []
  if (organization.website) links.push({ label: "Sitio web", url: externalUrl(organization.website) })
  if (organization.linkedin) links.push({ label: "LinkedIn", url: externalUrl(organization.linkedin) })
  for (const project of projects) {
    const projectLinks = (project.links ?? {}) as Record<string, unknown>
    for (const [label, value] of Object.entries(projectLinks)) {
      if (typeof value === "string" && /^https?:\/\//.test(value)) {
        links.push({ label, url: value, project: project.name })
      }
    }
  }

  return (
    <>
      <PageHeader
        title={organization.name}
        description={`${CLIENT_STATUS_LABELS[client.status]} · ${projects.length} proyecto${projects.length === 1 ? "" : "s"}`}
      />
      <div className="space-y-5 p-4 sm:p-6">
        <Link href="/clientes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver a clientes
        </Link>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Trabajo y proyectos</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {projects.length === 0 ? (
                  <Empty>Este cliente todavía no tiene proyectos.</Empty>
                ) : projects.map((project) => (
                  <Link key={project.id} href={`/proyectos/${project.id}`} className="flex flex-col gap-2 rounded-lg border p-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{project.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {PROJECT_AREA_LABELS[project.area as ProjectArea]}
                        {project.operational_type && ` · ${project.operational_type}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{formatDate(project.due_date)}</span>
                      <ProjectStatusBadge status={project.status} />
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Actividad e historial</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {activities.length === 0 && opportunities.length === 0 ? (
                  <Empty>Sin actividad registrada.</Empty>
                ) : (
                  <>
                    {activities.slice(0, 10).map((activity) => (
                      <div key={activity.id} className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm">
                        <div>
                          <p>{activity.body || "Actividad sin detalle"}</p>
                          <p className="mt-0.5 text-xs capitalize text-muted-foreground">{activity.type}</p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatDate(activity.due_date ?? activity.created_at)}</span>
                      </div>
                    ))}
                    {opportunities.map((opportunity) => (
                      <Link key={opportunity.id} href={`/oportunidades/${opportunity.id}`} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm hover:bg-muted/40">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{opportunity.title}</p>
                          <p className="text-xs text-muted-foreground">{formatMoney(opportunity.estimated_value, opportunity.currency)}</p>
                        </div>
                        <StageBadge stage={opportunity.stage} />
                      </Link>
                    ))}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Finanzas</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MoneyStat label="Cobrado" ars={financeSummary.collectedThisMonth.ARS} usd={financeSummary.collectedThisMonth.USD} />
                  <MoneyStat label="Pendiente" ars={financeSummary.pending.ARS} usd={financeSummary.pending.USD} />
                  <MoneyStat label="Vencido" ars={financeSummary.overdue.ARS} usd={financeSummary.overdue.USD} danger />
                  <MoneyStat label="Gastos" ars={financeSummary.expensesThisMonth.ARS} usd={financeSummary.expensesThisMonth.USD} />
                </div>
                {finances.length > 0 ? finances.slice(0, 6).map((record) => {
                  const status = financialStatus(record, today)
                  return (
                    <div key={record.id} className="flex items-center justify-between gap-3 border-t pt-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate">{record.concept}</p>
                        <p className="text-xs text-muted-foreground">{FINANCIAL_STATUS_LABELS[status]}</p>
                      </div>
                      <span className={status === "overdue" ? "font-mono text-destructive" : "font-mono"}>
                        {formatMoney(financialBalance(record), record.currency)}
                      </span>
                    </div>
                  )
                }) : <Empty>Sin registros financieros.</Empty>}
                <Link href="/finanzas" className="inline-flex text-xs text-primary hover:underline">Abrir Finanzas</Link>
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Próxima acción</CardTitle></CardHeader>
              <CardContent>
                {nextAction ? (
                  <Link href={`/oportunidades/${nextAction.id}`} className="block rounded-lg border p-3 hover:bg-muted/40">
                    <p className="text-sm font-medium">{nextAction.next_action || "Falta definir la próxima acción"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{nextAction.title} · {formatDate(nextAction.next_action_date)}</p>
                  </Link>
                ) : <Empty>Sin seguimiento comercial pendiente.</Empty>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Datos y contactos</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1 text-sm">
                  <Field label="Responsable" value={client.owner?.full_name} />
                  <Field label="Inicio" value={formatDate(client.start_date)} />
                  <Field label="Industria" value={organization.industry} />
                  <Field label="Ciudad" value={organization.city} />
                  <Field label="Dominio" value={organization.domain} />
                </div>
                {(contactsRes.data ?? []).map((contact) => (
                  <div key={contact.id} className="border-t pt-3">
                    <p className="text-sm font-medium">{contact.full_name}</p>
                    {contact.title && <p className="text-xs text-muted-foreground">{contact.title}</p>}
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {contact.email && <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 hover:text-foreground"><Mail className="h-3 w-3" />{contact.email}</a>}
                      {contact.phone && <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 hover:text-foreground"><Phone className="h-3 w-3" />{contact.phone}</a>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Accesos directos</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {links.length > 0 ? links.map((link, index) => (
                  <a key={`${link.url}-${index}`} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
                    <span className="min-w-0 truncate">{link.project ? `${link.project} · ${link.label}` : link.label}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </a>
                )) : <Empty>Sin enlaces cargados.</Empty>}
              </CardContent>
            </Card>

            {(client.notes || organization.notes || leadsRes.data?.length) && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Notas</CardTitle></CardHeader>
                <CardContent className="space-y-2 whitespace-pre-wrap text-sm">
                  {client.notes && <p>{client.notes}</p>}
                  {organization.notes && <p className="text-muted-foreground">{organization.notes}</p>}
                  {leadsRes.data && leadsRes.data.length > 0 && <Badge variant="secondary">{leadsRes.data.length} lead{leadsRes.data.length === 1 ? "" : "s"} histórico{leadsRes.data.length === 1 ? "" : "s"}</Badge>}
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      </div>
    </>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">{children}</p>
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return <div className="flex justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value || "—"}</span></div>
}

function MoneyStat({ label, ars, usd, danger = false }: { label: string; ars: number; usd: number; danger?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className={`mt-1 font-mono text-xs font-medium ${danger && (ars > 0 || usd > 0) ? "text-destructive" : ""}`}>
        <p>{formatMoney(ars, "ARS")}</p><p>{formatMoney(usd, "USD")}</p>
      </div>
    </div>
  )
}

function externalUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}
