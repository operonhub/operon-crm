import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CalendarClock, ExternalLink, WalletCards, Zap } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { ServiceTypeBadge } from "@/components/project-badges"
import { ProjectStatusControl } from "@/components/projects/status-control"
import { LinksDialog, type ProjectLinks } from "@/components/projects/links-dialog"
import { TaskList, type Task } from "@/components/projects/task-list"
import { ProjectOperationalDialog } from "@/components/projects/operational-dialog"
import { ProjectOperationsPanel } from "@/components/projects/project-operations-panel"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  ACTIVITY_TYPE_LABELS,
  AUTOMATION_STATUS_LABELS,
  FINANCIAL_STATUS_LABELS,
  PROJECT_AREA_LABELS,
  PROJECT_ENGAGEMENT_LABELS,
  type FinancialRecordType,
  type ProjectArea,
  type ProjectEngagement,
  type SupportedCurrency,
} from "@/lib/constants"
import { financialBalance, financialStatus, summarizeFinances } from "@/lib/finance"
import { formatDate, formatMoney, todayISO } from "@/lib/format"

const LINK_LABELS: Record<string, string> = {
  figma: "Figma",
  repo: "Repositorio",
  staging: "Staging",
  prod: "Producción",
  analytics: "Analytics",
  vercel: "Vercel",
  supabase: "Supabase",
  n8n: "n8n",
  docs: "Documentación",
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from("projects")
    .select(
      `id, name, type, area, engagement_kind, operational_type, status, scope, conversion_goal, kpi, start_date, due_date, links,
       client_id, owner_id, archived_at, archive_reason,
       client:clients(id, organization:organizations(id, name)),
       owner:profiles!projects_owner_id_fkey(full_name),
       opportunity:opportunities(id, title)`
    )
    .eq("id", id)
    .maybeSingle()

  if (!project) notFound()

  const [tasksRes, automationsRes, activitiesRes, financeRes, clientsRes, profilesRes] = await Promise.all([
    supabase
      .from("project_tasks")
      .select("id, title, description, status, priority, due_date, owner_id, position, owner:profiles!project_tasks_owner_id_fkey(full_name)")
      .eq("project_id", id)
      .is("archived_at", null)
      .order("position"),
    supabase
      .from("automations")
      .select("id, name, n8n_url, environment, status, last_result, last_run_at")
      .eq("project_id", id),
    supabase
      .from("activities")
      .select("id, type, body, due_date, completed, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("financial_records")
      .select("id, record_type, concept, currency, total_amount, paid_amount, due_date, paid_at, canceled_at, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("clients")
      .select("id, organization:organizations(name)")
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, full_name")
      .order("full_name"),
  ])

  const tasks = tasksRes.data ?? []
  const automations = automationsRes.data ?? []
  const activities = activitiesRes.data ?? []
  const today = todayISO()
  const finances = (financeRes.data ?? []).map((record) => ({
    ...record,
    record_type: record.record_type as FinancialRecordType,
    currency: record.currency as SupportedCurrency,
  }))
  const financeSummary = summarizeFinances(finances, today)
  const clients = (clientsRes.data ?? []).map((client) => ({
    id: client.id,
    name: client.organization?.name ?? "Cliente sin organización",
  }))

  const links = (project.links ?? {}) as ProjectLinks
  const linkEntries = Object.entries(links).filter(([, v]) => v)
  const { data: authData } = await supabase.auth.getUser()
  const [milestonesRes, blockersRes, collaboratorsRes, agentsRes, projectAgentsRes, currentProfileRes] = await Promise.all([
    supabase.from("project_milestones").select("id, title, description, due_date, status").eq("project_id", id).order("due_date"),
    supabase.from("project_blockers").select("id, title, detail, status, owner:profiles!project_blockers_owner_id_fkey(full_name)").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("project_collaborators").select("profile_id").eq("project_id", id),
    supabase.from("agents").select("id, name").neq("status", "archived").order("name"),
    supabase.from("project_agents").select("agent_id").eq("project_id", id),
    authData.user
      ? supabase.from("profiles").select("role").eq("id", authData.user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return (
    <>
      <PageHeader title={project.name}>
        <ProjectOperationalDialog
          projectId={project.id}
          area={project.area as ProjectArea}
          engagementKind={project.engagement_kind as ProjectEngagement}
          operationalType={project.operational_type}
          clientId={project.client?.id ?? null}
          clients={clients}
        />
        <LinksDialog projectId={project.id} links={links} />
        <ProjectStatusControl
          projectId={project.id}
          currentStatus={project.status}
        />
      </PageHeader>

      <div className="space-y-4 p-6">
        <Link
          href="/proyectos"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a proyectos
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <ServiceTypeBadge type={project.type} />
          <Badge variant="secondary">{PROJECT_AREA_LABELS[project.area as ProjectArea]}</Badge>
          <Badge variant="outline">{PROJECT_ENGAGEMENT_LABELS[project.engagement_kind as ProjectEngagement]}</Badge>
          {project.operational_type && <span className="text-sm text-muted-foreground">{project.operational_type}</span>}
          {project.client?.organization && (
            <Link
              href={`/clientes/${project.client.id}`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {project.client.organization.name}
            </Link>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-1">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Datos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <Field label="Responsable" value={project.owner?.full_name} />
                <Field label="Área" value={PROJECT_AREA_LABELS[project.area as ProjectArea]} />
                <Field label="Modalidad" value={PROJECT_ENGAGEMENT_LABELS[project.engagement_kind as ProjectEngagement]} />
                <Field label="Tipo operativo" value={project.operational_type} />
                <Field label="Inicio" value={formatDate(project.start_date)} />
                <Field label="Entrega" value={formatDate(project.due_date)} />
                {project.conversion_goal && (
                  <Field
                    label="Objetivo conversión"
                    value={project.conversion_goal}
                  />
                )}
                {project.kpi && <Field label="KPI" value={project.kpi} />}
                {project.scope && (
                  <div className="pt-2">
                    <p className="text-xs text-muted-foreground">Alcance</p>
                    <p className="whitespace-pre-wrap">{project.scope}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Enlaces</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {linkEntries.length > 0 ? (
                  linkEntries.map(([key, url]) => (
                    <a
                      key={key}
                      href={url as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {LINK_LABELS[key] ?? key}
                    </a>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Sin enlaces.</p>
                )}
              </CardContent>
            </Card>

            {automations && automations.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Zap className="h-4 w-4" /> Automatizaciones
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {automations.map((a) => (
                    <div key={a.id} className="rounded-md border p-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{a.name}</span>
                        <Badge variant="secondary">
                          {AUTOMATION_STATUS_LABELS[a.status]}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        <span>{a.environment}</span>
                        {a.last_result && <span>Último resultado: {a.last_result}</span>}
                        {a.n8n_url && (
                          <a
                            href={a.n8n_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            Ver en n8n
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Checklist</CardTitle>
              </CardHeader>
              <CardContent>
                <TaskList
                  projectId={project.id}
                  tasks={(tasks ?? []) as Task[]}
                  profiles={profilesRes.data ?? []}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm"><CalendarClock className="h-4 w-4" /> Actividad</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {activities.length > 0 ? activities.slice(0, 10).map((activity) => (
                  <div key={activity.id} className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm">
                    <div><p>{activity.body || "Actividad sin detalle"}</p><p className="mt-0.5 text-xs text-muted-foreground">{ACTIVITY_TYPE_LABELS[activity.type]}{activity.completed ? " · Completada" : ""}</p></div>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDate(activity.due_date ?? activity.created_at)}</span>
                  </div>
                )) : <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Sin actividad registrada.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><WalletCards className="h-4 w-4" /> Finanzas relacionadas</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <MoneyStat label="Cobrado" ars={financeSummary.collectedThisMonth.ARS} usd={financeSummary.collectedThisMonth.USD} />
                  <MoneyStat label="Pendiente" ars={financeSummary.pending.ARS} usd={financeSummary.pending.USD} />
                  <MoneyStat label="Vencido" ars={financeSummary.overdue.ARS} usd={financeSummary.overdue.USD} danger />
                </div>
                {finances.length > 0 ? finances.slice(0, 6).map((record) => {
                  const status = financialStatus(record, today)
                  return <div key={record.id} className="flex items-center justify-between gap-3 border-t pt-3 text-sm"><div className="min-w-0"><p className="truncate">{record.concept}</p><p className="text-xs text-muted-foreground">{FINANCIAL_STATUS_LABELS[status]}</p></div><span className={status === "overdue" ? "font-mono text-destructive" : "font-mono"}>{formatMoney(financialBalance(record), record.currency)}</span></div>
                }) : <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Sin registros financieros para este proyecto.</p>}
                <Link href="/finanzas" className="inline-flex text-xs text-primary hover:underline">Abrir Finanzas</Link>
              </CardContent>
            </Card>
          </div>
        </div>

        <section className="space-y-3 pt-2" aria-labelledby="project-operations-title">
          <div>
            <p className="label-mono text-primary">Operación</p>
            <h2 id="project-operations-title" className="mt-1 text-xl font-semibold">Equipo, hitos y bloqueos</h2>
          </div>
          <ProjectOperationsPanel
            project={project}
            clients={clients}
            profiles={profilesRes.data ?? []}
            collaboratorIds={(collaboratorsRes.data ?? []).map((item) => item.profile_id)}
            agents={agentsRes.data ?? []}
            linkedAgentIds={(projectAgentsRes.data ?? []).map((item) => item.agent_id)}
            milestones={milestonesRes.data ?? []}
            blockers={blockersRes.data ?? []}
            isAdmin={currentProfileRes.data?.role === "admin"}
          />
        </section>
      </div>
    </>
  )
}

function MoneyStat({ label, ars, usd, danger = false }: { label: string; ars: number; usd: number; danger?: boolean }) {
  return <div className="rounded-md bg-muted/50 p-2"><p className="text-[10px] text-muted-foreground">{label}</p><div className={`mt-1 font-mono text-[11px] ${danger && (ars > 0 || usd > 0) ? "text-destructive" : ""}`}><p>{formatMoney(ars, "ARS")}</p><p>{formatMoney(usd, "USD")}</p></div></div>
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || "—"}</span>
    </div>
  )
}
