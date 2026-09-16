import Link from "next/link"
import { BarChart3, BriefcaseBusiness, CircleDollarSign, FolderKanban } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { CountUp } from "@/components/shell/count-up"
import { KpiCard } from "@/components/shell/kpi-card"
import { MoneyPair } from "@/components/shell/money-pair"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ACTIVE_PROJECT_STATUSES,
  ACTIVE_STAGES,
  LEAD_SOURCE_LABELS,
  OPPORTUNITY_STAGES,
  PROJECT_AREAS,
  PROJECT_AREA_LABELS,
  STAGE_LABELS,
  type FinancialRecordType,
  type ProjectArea,
  type SupportedCurrency,
} from "@/lib/constants"
import { summarizeFinances, type MoneyByCurrency } from "@/lib/finance"
import { addDaysISO, todayISO } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Enums } from "@/lib/supabase/types"
import { PageTransition } from "@/components/shell/page-transition"

export default async function MetricasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const period = typeof params.period === "string" ? params.period : "90d"
  const owner = typeof params.owner === "string" ? params.owner : "all"
  const area = typeof params.area === "string" ? params.area : "all"
  const currency = typeof params.currency === "string" ? params.currency : "all"
  const today = todayISO()
  const rangeFrom = typeof params.from === "string" ? params.from : ""
  const rangeTo = typeof params.to === "string" ? params.to : today
  const dateFrom = period === "30d" ? addDaysISO(today, -30) : period === "year" ? `${today.slice(0, 4)}-01-01` : period === "all" ? "" : period === "custom" ? rangeFrom : addDaysISO(today, -90)
  const supabase = await createClient()

  /**
   * Período, dueño, área y moneda se filtran en SQL.
   *
   * Antes se traían las siete tablas enteras —todo el historial— y se filtraba
   * en JS, así que ver "últimos 30 días" costaba lo mismo que ver todo y
   * empeoraba con cada lead cargado. La semántica es la misma de antes: el
   * borde superior incluye el día entero (`< hasta + 1 día`).
   */
  const toExclusive = rangeTo ? addDaysISO(rangeTo, 1) : ""

  let leadsQuery = supabase.from("leads").select("source, status, owner_id, created_at")
  let oppsQuery = supabase.from("opportunities").select("stage, estimated_value, currency, owner_id, created_at")
  let activitiesQuery = supabase.from("activities").select("type, owner_id, created_at")
  let projectsQuery = supabase.from("projects").select("id, area, status, due_date, owner_id, created_at, project_tasks(status)")
  let financeQuery = supabase.from("financial_records").select("record_type, currency, total_amount, paid_amount, due_date, paid_at, canceled_at, created_at")

  if (dateFrom) {
    leadsQuery = leadsQuery.gte("created_at", dateFrom)
    oppsQuery = oppsQuery.gte("created_at", dateFrom)
    activitiesQuery = activitiesQuery.gte("created_at", dateFrom)
    projectsQuery = projectsQuery.gte("created_at", dateFrom)
    financeQuery = financeQuery.gte("created_at", dateFrom)
  }
  if (toExclusive) {
    leadsQuery = leadsQuery.lt("created_at", toExclusive)
    oppsQuery = oppsQuery.lt("created_at", toExclusive)
    activitiesQuery = activitiesQuery.lt("created_at", toExclusive)
    projectsQuery = projectsQuery.lt("created_at", toExclusive)
    financeQuery = financeQuery.lt("created_at", toExclusive)
  }
  if (owner !== "all") {
    leadsQuery = leadsQuery.eq("owner_id", owner)
    oppsQuery = oppsQuery.eq("owner_id", owner)
    activitiesQuery = activitiesQuery.eq("owner_id", owner)
    projectsQuery = projectsQuery.eq("owner_id", owner)
  }
  if (currency === "ARS" || currency === "USD") {
    oppsQuery = oppsQuery.eq("currency", currency)
    financeQuery = financeQuery.eq("currency", currency)
  }
  if (area !== "all" && (PROJECT_AREAS as readonly string[]).includes(area)) {
    projectsQuery = projectsQuery.eq("area", area as ProjectArea)
  }

  const [leadsRes, oppsRes, activitiesRes, projectsRes, financeRes, automationsRes, profilesRes] = await Promise.all([
    leadsQuery,
    oppsQuery,
    activitiesQuery,
    projectsQuery,
    financeQuery,
    supabase.from("automations").select("id, status, last_result"),
    supabase.from("profiles").select("id, full_name").order("full_name"),
  ])

  const leads = leadsRes.data ?? []
  const opportunities = oppsRes.data ?? []
  const activities = activitiesRes.data ?? []
  const projects = projectsRes.data ?? []
  const finances = (financeRes.data ?? []).map((record) => ({
    ...record,
    record_type: record.record_type as FinancialRecordType,
    currency: record.currency as SupportedCurrency,
  }))
  const finance = summarizeFinances(finances, today)

  const sources = Object.keys(LEAD_SOURCE_LABELS) as Enums<"lead_source">[]
  const bySource = sources.map((source) => {
    const rows = leads.filter((lead) => lead.source === source)
    const converted = rows.filter((lead) => lead.status === "convertido").length
    return { source, total: rows.length, converted, rate: rows.length ? Math.round((converted / rows.length) * 100) : 0 }
  }).filter((row) => row.total > 0).sort((a, b) => b.total - a.total)

  const byStage = OPPORTUNITY_STAGES.map((stage) => ({
    stage,
    count: opportunities.filter((opportunity) => opportunity.stage === stage).length,
  })).filter((row) => row.count > 0)

  const activeOpps = opportunities.filter((opportunity) => ACTIVE_STAGES.includes(opportunity.stage))
  const wonOpps = opportunities.filter((opportunity) => opportunity.stage === "ganado")
  const pipeline = totalsByCurrency(activeOpps)
  const won = totalsByCurrency(wonOpps)
  const conversion = leads.length
    ? Math.round((leads.filter((lead) => lead.status === "convertido").length / leads.length) * 100)
    : null

  const activeProjects = projects.filter((project) => ACTIVE_PROJECT_STATUSES.includes(project.status))
  const delivered = projects.filter((project) => project.status === "entregado" || project.status === "cerrado").length
  const delayed = activeProjects.filter((project) => project.due_date && project.due_date < today).length
  const pendingTasks = projects.flatMap((project) => project.project_tasks ?? []).filter((task) => task.status !== "completada").length
  const blockedTasks = projects.flatMap((project) => project.project_tasks ?? []).filter((task) => task.status === "bloqueada").length
  const projectsByArea = Object.fromEntries(PROJECT_AREAS.map((area) => [area, activeProjects.filter((project) => project.area === area).length])) as Record<ProjectArea, number>

  const commercialMetrics = [
    { label: "Leads", value: leads.length, href: "/leads" },
    { label: "Oportunidades activas", value: activeOpps.length, href: "/oportunidades" },
    { label: "Conversión lead → oportunidad", value: conversion === null ? "Sin base" : `${conversion}%`, href: "/leads" },
    { label: "Reuniones registradas", value: activities.filter((activity) => activity.type === "reunion").length, href: "/?view=activities" },
  ]

  return (
    <PageTransition>
    <>
      <PageHeader title="Métricas" description="Indicadores reales para decidir, sin integraciones simuladas" />
      <div className="space-y-6 p-4 sm:p-6">
        <form className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_auto]" method="get">
          <FilterLabel label="Período"><select name="period" defaultValue={period} className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="30d">Últimos 30 días</option><option value="90d">Últimos 90 días</option><option value="year">Año actual</option><option value="all">Todo</option><option value="custom">Rango</option></select></FilterLabel>
          <FilterLabel label="Desde"><Input name="from" type="date" defaultValue={rangeFrom} /></FilterLabel>
          <FilterLabel label="Hasta"><Input name="to" type="date" defaultValue={rangeTo} /></FilterLabel>
          <FilterLabel label="Responsable"><select name="owner" defaultValue={owner} className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="all">Todos</option>{(profilesRes.data ?? []).map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}</select></FilterLabel>
          <FilterLabel label="Área"><select name="area" defaultValue={area} className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="all">Todas</option>{PROJECT_AREAS.map((value) => <option key={value} value={value}>{PROJECT_AREA_LABELS[value]}</option>)}</select></FilterLabel>
          <FilterLabel label="Moneda"><select name="currency" defaultValue={currency} className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="all">ARS y USD</option><option value="ARS">ARS</option><option value="USD">USD</option></select></FilterLabel>
          <Button type="submit" className="self-end">Aplicar</Button>
        </form>
        {(projectsRes.error || financeRes.error) && (
          <p role="status" className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            Las métricas operativas completas estarán disponibles al aplicar la migración nueva.
          </p>
        )}

        <MetricSection icon={BriefcaseBusiness} title="Comercial">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {commercialMetrics.map((metric) => <MetricCard key={metric.label} label={metric.label} value={metric.value} href={metric.href} />)}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <MoneyCard title="Pipeline activo" totals={pipeline} href="/oportunidades" />
            <MoneyCard title="Valor ganado" totals={won} href="/oportunidades?stage=ganado" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Distribution title="Leads por fuente" rows={bySource.map((row) => ({ label: LEAD_SOURCE_LABELS[row.source], value: row.total, detail: `${row.converted} convertidos · ${row.rate}%` }))} />
            <Distribution title="Oportunidades por etapa" rows={byStage.map((row) => ({ label: STAGE_LABELS[row.stage], value: row.count }))} />
          </div>
        </MetricSection>

        <MetricSection icon={FolderKanban} title="Proyectos">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="Activos" value={activeProjects.length} href="/proyectos?status=active" />
            <MetricCard label="Entregados / cerrados" value={delivered} href="/proyectos?status=entregado" />
            <MetricCard label="Atrasados" value={delayed} danger={delayed > 0} href="/proyectos?status=delayed" />
            <MetricCard label="Tareas bloqueadas" value={blockedTasks} danger={blockedTasks > 0} href="/proyectos?task_status=bloqueada" />
          </div>
          <AreaBreakdown counts={projectsByArea} />
          <p className="text-sm text-muted-foreground">{pendingTasks} tareas pendientes en todos los proyectos. Entregas a tiempo se habilitará cuando exista una fecha real de entrega completada.</p>
        </MetricSection>

        <MetricSection icon={CircleDollarSign} title="Finanzas">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MoneyCard title="Cobrado este mes" totals={finance.collectedThisMonth} href="/finanzas?status=paid" />
            <MoneyCard title="Pendiente" totals={finance.pending} href="/finanzas?status=pending" />
            <MoneyCard title="Vencido" totals={finance.overdue} danger href="/finanzas?status=overdue" />
            <MoneyCard title="Gastos este mes" totals={finance.expensesThisMonth} href="/finanzas?type=expense" />
          </div>
        </MetricSection>

        <MetricSection icon={BarChart3} title="Indicadores por área">
          {activeProjects.length > 0 || (automationsRes.data?.length ?? 0) > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {PROJECT_AREAS.filter((area) => projectsByArea[area] > 0).map((area) => (
                <MetricCard key={area} label={PROJECT_AREA_LABELS[area]} value={`${projectsByArea[area]} activo${projectsByArea[area] === 1 ? "" : "s"}`} />
              ))}
              {(automationsRes.data?.length ?? 0) > 0 && (
                <MetricCard
                  label="Automatizaciones registradas"
                  value={automationsRes.data?.length ?? 0}
                  detail={`${(automationsRes.data ?? []).filter((automation) => /error|fail|fall[oó]/i.test(automation.last_result ?? "")).length} con último resultado fallido`}
                />
              )}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Todavía no hay datos por área. Search Console, Analytics, usuarios y suscripciones se mostrarán recién cuando estén integrados.</p>
          )}
        </MetricSection>
      </div>
    </>
    </PageTransition>
  )
}

function totalsByCurrency(rows: { estimated_value: number | null; currency: string }[]): MoneyByCurrency {
  return rows.reduce<MoneyByCurrency>((totals, row) => {
    if (row.currency === "ARS" || row.currency === "USD") totals[row.currency] += row.estimated_value ?? 0
    return totals
  }, { ARS: 0, USD: 0 })
}

function MetricSection({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return <section className="space-y-3"><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-muted-foreground" /><h2 className="font-heading text-sm font-semibold">{title}</h2></div>{children}</section>
}

function MetricCard({ label, value, detail, danger = false, href }: { label: string; value: string | number; detail?: string; danger?: boolean; href?: string }) {
  // Los números cuentan hacia arriba; los textos ("3 activos") se muestran tal cual.
  return typeof value === "number" ? (
    <KpiCard label={label} value={value} hint={detail} tone={danger ? "danger" : "default"} href={href} />
  ) : (
    <KpiCard label={label} display={value} hint={detail} tone={danger ? "danger" : "default"} href={href} />
  )
}

function MoneyCard({ title, totals, danger = false, href }: { title: string; totals: MoneyByCurrency; danger?: boolean; href?: string }) {
  const alert = danger && (totals.ARS > 0 || totals.USD > 0)
  return (
    <KpiCard
      label={title}
      tone={alert ? "danger" : "default"}
      href={href}
      display={<MoneyPair totals={totals} />}
    />
  )
}

function Distribution({ title, rows }: { title: string; rows: { label: string; value: number; detail?: string }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  const total = rows.reduce((sum, row) => sum + row.value, 0)
  return (
    <Card className="spotlight">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-baseline justify-between gap-3 text-sm">
          {title}
          {total > 0 && (
            <span className="font-mono text-xs font-normal text-muted-foreground tabular-nums">{total} en total</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin datos.</p>
        ) : (
          rows.map((row, index) => (
            // La fila entera responde al mouse: la barra se engrosa y aparece qué parte del total es.
            <div
              key={row.label}
              className="group/row -mx-2 space-y-1.5 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-muted/60"
            >
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>{row.label}</span>
                <span className="text-xs text-muted-foreground">
                  <span className="mr-2 font-mono opacity-0 transition-opacity duration-150 group-hover/row:opacity-100">
                    {Math.round((row.value / Math.max(1, total)) * 100)}%
                  </span>
                  <span className="font-mono font-medium text-foreground tabular-nums">{row.value}</span>
                  {row.detail ? ` · ${row.detail}` : ""}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted transition-transform duration-150 group-hover/row:scale-y-[1.6]">
                <div
                  className="chart-grow-x h-full rounded-full bg-primary"
                  style={{ width: `${(row.value / max) * 100}%`, animationDelay: `${Math.min(index * 70, 420)}ms` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

const AREA_BAR: Record<ProjectArea, string> = {
  sites_ecommerce: "bg-primary",
  apps_saas: "bg-primary/55",
  automations_crm: "bg-warning",
  assets_brand: "bg-foreground/35",
}

/** Proyectos activos por área: número que cuenta y barra relativa al área más cargada. */
function AreaBreakdown({ counts }: { counts: Record<ProjectArea, number> }) {
  const max = Math.max(1, ...Object.values(counts))
  return (
    <Card className="spotlight gap-0 p-0">
      <div className="grid grid-cols-2 lg:grid-cols-4">
        {PROJECT_AREAS.map((area, index) => (
          <Link
            key={area}
            href={`/proyectos#area-${area}`}
            className={cn(
              "group/area block p-4 transition-colors duration-150 hover:bg-muted/40",
              index % 2 === 1 && "border-l",
              index === 2 && "lg:border-l",
              index > 1 && "border-t lg:border-t-0"
            )}
          >
            <p className="text-xs text-muted-foreground transition-colors duration-150 group-hover/area:text-foreground">
              {PROJECT_AREA_LABELS[area]}
            </p>
            <p className="mt-2 font-mono text-xl font-semibold tabular-nums">
              <CountUp value={counts[area]} />
            </p>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("chart-grow-x h-full rounded-full", AREA_BAR[area])}
                style={{ width: `${(counts[area] / max) * 100}%`, animationDelay: `${120 + index * 80}ms` }}
              />
            </div>
          </Link>
        ))}
      </div>
    </Card>
  )
}

function FilterLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1.5"><span className="label-mono text-muted-foreground">{label}</span>{children}</label>
}
