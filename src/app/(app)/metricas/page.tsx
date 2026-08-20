import { BarChart3, BriefcaseBusiness, CircleDollarSign, FolderKanban } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
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
import { formatMoney, todayISO } from "@/lib/format"
import type { Enums } from "@/lib/supabase/types"

export default async function MetricasPage() {
  const supabase = await createClient()
  const [leadsRes, oppsRes, activitiesRes, projectsRes, financeRes, automationsRes] = await Promise.all([
    supabase.from("leads").select("source, status"),
    supabase.from("opportunities").select("stage, estimated_value, currency"),
    supabase.from("activities").select("type"),
    supabase.from("projects").select("id, area, status, due_date, project_tasks(status)"),
    supabase.from("financial_records").select("record_type, currency, total_amount, paid_amount, due_date, paid_at, canceled_at"),
    supabase.from("automations").select("id, status, last_result"),
  ])

  const leads = leadsRes.data ?? []
  const opportunities = oppsRes.data ?? []
  const activities = activitiesRes.data ?? []
  const projects = projectsRes.data ?? []
  const today = todayISO()
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
    { label: "Leads", value: leads.length },
    { label: "Oportunidades activas", value: activeOpps.length },
    { label: "Conversión lead → oportunidad", value: conversion === null ? "Sin base" : `${conversion}%` },
    { label: "Reuniones registradas", value: activities.filter((activity) => activity.type === "reunion").length },
  ]

  return (
    <>
      <PageHeader title="Métricas" description="Indicadores reales para decidir, sin integraciones simuladas" />
      <div className="space-y-6 p-4 sm:p-6">
        {(projectsRes.error || financeRes.error) && (
          <p role="status" className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            Las métricas operativas completas estarán disponibles al aplicar la migración nueva.
          </p>
        )}

        <MetricSection icon={BriefcaseBusiness} title="Comercial">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {commercialMetrics.map((metric) => <MetricCard key={metric.label} label={metric.label} value={metric.value} />)}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <MoneyCard title="Pipeline activo" totals={pipeline} />
            <MoneyCard title="Valor ganado" totals={won} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Distribution title="Leads por fuente" rows={bySource.map((row) => ({ label: LEAD_SOURCE_LABELS[row.source], value: row.total, detail: `${row.converted} convertidos · ${row.rate}%` }))} />
            <Distribution title="Oportunidades por etapa" rows={byStage.map((row) => ({ label: STAGE_LABELS[row.stage], value: row.count }))} />
          </div>
        </MetricSection>

        <MetricSection icon={FolderKanban} title="Proyectos">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="Activos" value={activeProjects.length} />
            <MetricCard label="Entregados / cerrados" value={delivered} />
            <MetricCard label="Atrasados" value={delayed} danger={delayed > 0} />
            <MetricCard label="Tareas bloqueadas" value={blockedTasks} danger={blockedTasks > 0} />
          </div>
          <Card className="gap-0 p-0">
            <div className="grid grid-cols-2 lg:grid-cols-4">
              {PROJECT_AREAS.map((area, index) => (
                <div key={area} className={`p-4 ${index > 0 ? "border-l" : ""} ${index > 1 ? "border-t lg:border-t-0" : ""}`}>
                  <p className="text-xs text-muted-foreground">{PROJECT_AREA_LABELS[area]}</p>
                  <p className="mt-2 font-mono text-xl font-semibold tabular-nums">{projectsByArea[area]}</p>
                </div>
              ))}
            </div>
          </Card>
          <p className="text-sm text-muted-foreground">{pendingTasks} tareas pendientes en todos los proyectos. Entregas a tiempo se habilitará cuando exista una fecha real de entrega completada.</p>
        </MetricSection>

        <MetricSection icon={CircleDollarSign} title="Finanzas">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MoneyCard title="Cobrado este mes" totals={finance.collectedThisMonth} />
            <MoneyCard title="Pendiente" totals={finance.pending} />
            <MoneyCard title="Vencido" totals={finance.overdue} danger />
            <MoneyCard title="Gastos este mes" totals={finance.expensesThisMonth} />
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

function MetricCard({ label, value, detail, danger = false }: { label: string; value: string | number; detail?: string; danger?: boolean }) {
  return <Card className="gap-0 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-2 font-mono text-xl font-semibold tabular-nums ${danger ? "text-destructive" : ""}`}>{value}</p>{detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}</Card>
}

function MoneyCard({ title, totals, danger = false }: { title: string; totals: MoneyByCurrency; danger?: boolean }) {
  return <Card className="gap-0 p-4"><p className="text-xs text-muted-foreground">{title}</p><div className={`mt-2 space-y-0.5 font-mono text-sm font-semibold tabular-nums ${danger && (totals.ARS > 0 || totals.USD > 0) ? "text-destructive" : ""}`}><p>{formatMoney(totals.ARS, "ARS")}</p><p>{formatMoney(totals.USD, "USD")}</p></div></Card>
}

function Distribution({ title, rows }: { title: string; rows: { label: string; value: number; detail?: string }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  return <Card><CardHeader className="pb-3"><CardTitle className="text-sm">{title}</CardTitle></CardHeader><CardContent className="space-y-3">{rows.length === 0 ? <p className="text-sm text-muted-foreground">Sin datos.</p> : rows.map((row) => <div key={row.label} className="space-y-1"><div className="flex items-center justify-between gap-3 text-sm"><span>{row.label}</span><span className="text-xs text-muted-foreground">{row.value}{row.detail ? ` · ${row.detail}` : ""}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${(row.value / max) * 100}%` }} /></div></div>)}</CardContent></Card>
}
