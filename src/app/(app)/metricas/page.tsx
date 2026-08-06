import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  LEAD_SOURCE_LABELS,
  STAGE_LABELS,
  OPPORTUNITY_STAGES,
  ACTIVE_STAGES,
} from "@/lib/constants"
import { formatMoney } from "@/lib/format"
import type { Enums } from "@/lib/supabase/types"

export default async function MetricasPage() {
  const supabase = await createClient()

  const [{ data: leads }, { data: opps }, { data: activities }] =
    await Promise.all([
      supabase.from("leads").select("source, status"),
      supabase.from("opportunities").select("stage, estimated_value"),
      supabase.from("activities").select("type"),
    ])

  const leadRows = leads ?? []
  const oppRows = opps ?? []
  const actRows = activities ?? []

  // ---- Leads por fuente + conversión ----
  const sources = Object.keys(LEAD_SOURCE_LABELS) as Enums<"lead_source">[]
  const bySource = sources
    .map((s) => {
      const rows = leadRows.filter((l) => l.source === s)
      const converted = rows.filter((l) => l.status === "convertido").length
      return {
        source: s,
        total: rows.length,
        converted,
        rate: rows.length ? Math.round((converted / rows.length) * 100) : 0,
      }
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)

  // ---- Oportunidades por etapa ----
  const byStage = OPPORTUNITY_STAGES.map((stage) => {
    const rows = oppRows.filter((o) => o.stage === stage)
    return {
      stage,
      count: rows.length,
      value: rows.reduce((s, o) => s + (o.estimated_value ?? 0), 0),
    }
  }).filter((r) => r.count > 0)

  // ---- KPIs ----
  const totalLeads = leadRows.length
  const wonRows = oppRows.filter((o) => o.stage === "ganado")
  const wonValue = wonRows.reduce((s, o) => s + (o.estimated_value ?? 0), 0)
  const activeRows = oppRows.filter((o) => ACTIVE_STAGES.includes(o.stage))
  const pipelineValue = activeRows.reduce(
    (s, o) => s + (o.estimated_value ?? 0),
    0
  )
  const meetings = actRows.filter((a) => a.type === "reunion").length
  const totalConverted = leadRows.filter(
    (l) => l.status === "convertido"
  ).length
  const globalRate = totalLeads
    ? Math.round((totalConverted / totalLeads) * 100)
    : 0

  const maxSource = Math.max(1, ...bySource.map((r) => r.total))
  const maxStage = Math.max(1, ...byStage.map((r) => r.count))

  const kpis = [
    { label: "Leads totales", value: totalLeads },
    { label: "Oportunidades activas", value: activeRows.length },
    { label: "Ganadas", value: wonRows.length },
    { label: "Valor pipeline activo", value: formatMoney(pipelineValue) },
    { label: "Valor ganado", value: formatMoney(wonValue) },
    { label: "Conversión lead→cliente", value: `${globalRate}%` },
    { label: "Reuniones registradas", value: meetings },
  ]

  return (
    <>
      <PageHeader
        title="Métricas"
        description="Embudo por fuente y etapa — datos reales de la base"
      />
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
          {kpis.map((k) => (
            <Card key={k.label}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="mt-1 text-xl font-semibold">{k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                Leads por fuente y conversión
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {bySource.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin datos.</p>
              ) : (
                bySource.map((r) => (
                  <div key={r.source} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{LEAD_SOURCE_LABELS[r.source]}</span>
                      <span className="text-muted-foreground">
                        {r.total} · {r.converted} conv. ({r.rate}%)
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${(r.total / maxSource) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Oportunidades por etapa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {byStage.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin datos.</p>
              ) : (
                byStage.map((r) => (
                  <div key={r.stage} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{STAGE_LABELS[r.stage]}</span>
                      <span className="text-muted-foreground">
                        {r.count}
                        {r.value > 0 && ` · ${formatMoney(r.value)}`}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${(r.count / maxStage) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
