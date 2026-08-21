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
import { addDaysISO, formatMoney, todayISO } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Enums } from "@/lib/supabase/types"

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
  const [leadsRes, oppsRes, activitiesRes, projectsRes, financeRes, automationsRes, profilesRes] = await Promise.all([
    supabase.from("leads").select("source, status, owner_id, created_at"),
    supabase.from("opportunities").select("stage, estimated_value, currency, owner_id, created_at"),
    supabase.from("activities").select("type, owner_id, created_at"),
    supabase.from("projects").select("id, area, status, due_date, owner_id, created_at, project_tasks(status)"),
    supabase.from("financial_records").select("record_type, currency, total_amount, paid_amount, due_date, paid_at, canceled_at, created_at"),
    supabase.from("automations").select("id, status, last_result"),
    supabase.from("profiles").select("id, full_name").order("full_name"),
  ])

  const inRange = (createdAt: string) => (!dateFrom || createdAt.slice(0, 10) >= dateFrom) && (!rangeTo || createdAt.slice(0, 10) <= rangeTo)
  const ownedBy = (ownerId: string | null) => owner === "all" || ownerId === owner
  const leads = (leadsRes.data ?? []).filter((row) => inRange(row.created_at) && ownedBy(row.owner_id))
  const opportunities = (oppsRes.data ?? []).filter((row) => inRange(row.created_at) && ownedBy(row.owner_id) && (currency === "all" || row.currency === currency))
  const activities = (activitiesRes.data ?? []).filter((row) => inRange(row.created_at) && ownedBy(row.owner_id))
  const projects = (projectsRes.data ?? []).filter((row) => inRange(row.created_at) && ownedBy(row.owner_id) && (area === "all" || row.area === area))
  const finances = (financeRes.data ?? []).filter((row) => inRange(row.created_at) && (currency === "all" || row.currency === currency)).map((record) => ({
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
  const content = <Card className="h-full gap-0 p-4 transition-colors hover:border-primary/40"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-2 font-mono text-xl font-semibold tabular-nums ${danger ? "text-destructive" : ""}`}>{value}</p>{detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}</Card>
  return href ? <Link href={href}>{content}</Link> : content
}

function MoneyCard({ title, totals, danger = false, href }: { title: string; totals: MoneyByCurrency; danger?: boolean; href?: string }) {
  const content = <Card className="h-full gap-0 p-4 transition-colors hover:border-primary/40"><p className="text-xs text-muted-foreground">{title}</p><div className={`mt-2 space-y-0.5 font-mono text-sm font-semibold tabular-nums ${danger && (totals.ARS > 0 || totals.USD > 0) ? "text-destructive" : ""}`}><p>{formatMoney(totals.ARS, "ARS")}</p><p>{formatMoney(totals.USD, "USD")}</p></div></Card>
  return href ? <Link href={href}>{content}</Link> : content
}

function Distribution({ title, rows }: { title: string; rows: { label: string; value: number; detail?: string }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  return <Card><CardHeader className="pb-3"><CardTitle className="text-sm">{title}</CardTitle></CardHeader><CardContent className="space-y-3">{rows.length === 0 ? <p className="text-sm text-muted-foreground">Sin datos.</p> : rows.map((row) => <div key={row.label} className="space-y-1"><div className="flex items-center justify-between gap-3 text-sm"><span>{row.label}</span><span className="text-xs text-muted-foreground">{row.value}{row.detail ? ` · ${row.detail}` : ""}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${(row.value / max) * 100}%` }} /></div></div>)}</CardContent></Card>
}

function FilterLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1.5"><span className="label-mono text-muted-foreground">{label}</span>{children}</label>
}
import Link from "next/link"
