import Link from "next/link"
import {
  AlertTriangle,
  CalendarClock,
  CircleDashed,
  TrendingUp,
  Users,
  Target,
  FolderKanban,
} from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { StageBadge } from "@/components/stage-badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ACTIVE_STAGES } from "@/lib/constants"
import { ACTIVITY_TYPE_LABELS } from "@/lib/constants"
import { formatDateShort, formatMoney, todayISO } from "@/lib/format"
import type { Enums } from "@/lib/supabase/types"

export default async function DashboardPage() {
  const supabase = await createClient()
  const today = todayISO()

  const [
    overdueActivities,
    todayActivities,
    noNextAction,
    overdueOpps,
    kpiLeads,
    kpiOpps,
    kpiProjects,
    pipelineValue,
  ] = await Promise.all([
    // Actividades vencidas
    supabase
      .from("activities")
      .select("id, type, body, due_date, opportunity:opportunities(id, title)")
      .eq("completed", false)
      .not("due_date", "is", null)
      .lt("due_date", today)
      .order("due_date", { ascending: true }),
    // Actividades de hoy
    supabase
      .from("activities")
      .select("id, type, body, due_date, opportunity:opportunities(id, title)")
      .eq("completed", false)
      .eq("due_date", today),
    // Oportunidades activas sin próxima acción
    supabase
      .from("opportunities")
      .select("id, title, stage, organization:organizations(name)")
      .in("stage", ACTIVE_STAGES)
      .is("next_action_date", null),
    // Oportunidades con próxima acción vencida
    supabase
      .from("opportunities")
      .select(
        "id, title, stage, next_action, next_action_date, organization:organizations(name)"
      )
      .in("stage", ACTIVE_STAGES)
      .not("next_action_date", "is", null)
      .lt("next_action_date", today)
      .order("next_action_date", { ascending: true }),
    // KPIs
    supabase.from("leads").select("id", { count: "exact", head: true }),
    supabase
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .in("stage", ACTIVE_STAGES),
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .in("status", ["discovery", "en_progreso", "revision", "activo"]),
    supabase
      .from("opportunities")
      .select("estimated_value")
      .in("stage", ACTIVE_STAGES),
  ])

  const totalPipeline = (pipelineValue.data ?? []).reduce(
    (sum, o) => sum + (o.estimated_value ?? 0),
    0
  )

  const kpis = [
    { label: "Leads", value: kpiLeads.count ?? 0, icon: Users, href: "/leads" },
    {
      label: "Oportunidades activas",
      value: kpiOpps.count ?? 0,
      icon: Target,
      href: "/oportunidades",
    },
    {
      label: "Valor de pipeline",
      value: formatMoney(totalPipeline),
      icon: TrendingUp,
      href: "/metricas",
    },
    {
      label: "Proyectos activos",
      value: kpiProjects.count ?? 0,
      icon: FolderKanban,
      href: "/proyectos",
    },
  ]

  return (
    <>
      <PageHeader
        title="Hoy"
        description="Qué seguir hoy y qué está vencido"
      />
      <div className="space-y-6 p-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpis.map((k) => (
            <Link key={k.label} href={k.href}>
              <Card className="transition-colors hover:ring-primary/40">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                    <k.icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                      {k.label}
                    </p>
                    <p className="font-mono text-xl font-semibold tabular-nums">
                      {k.value}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Actividades vencidas */}
          <DashboardList
            title="Vencidas"
            icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
            count={overdueActivities.data?.length ?? 0}
            empty="Nada vencido. 🎉"
          >
            {overdueActivities.data?.map((a) => (
              <ActivityRow
                key={a.id}
                type={a.type}
                body={a.body}
                dueDate={a.due_date}
                oppTitle={a.opportunity?.title}
                oppId={a.opportunity?.id}
                overdue
              />
            ))}
          </DashboardList>

          {/* Actividades de hoy */}
          <DashboardList
            title="Para hoy"
            icon={<CalendarClock className="h-4 w-4 text-primary" />}
            count={todayActivities.data?.length ?? 0}
            empty="Sin tareas para hoy."
          >
            {todayActivities.data?.map((a) => (
              <ActivityRow
                key={a.id}
                type={a.type}
                body={a.body}
                dueDate={a.due_date}
                oppTitle={a.opportunity?.title}
                oppId={a.opportunity?.id}
              />
            ))}
          </DashboardList>

          {/* Oportunidades con próxima acción vencida */}
          <DashboardList
            title="Próxima acción vencida"
            icon={<AlertTriangle className="h-4 w-4 text-orange-500 dark:text-orange-400" />}
            count={overdueOpps.data?.length ?? 0}
            empty="Todo al día."
          >
            {overdueOpps.data?.map((o) => (
              <Link
                key={o.id}
                href={`/oportunidades/${o.id}`}
                className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{o.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {o.next_action}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StageBadge stage={o.stage} />
                  <span className="text-xs text-destructive">
                    {formatDateShort(o.next_action_date)}
                  </span>
                </div>
              </Link>
            ))}
          </DashboardList>

          {/* Oportunidades sin próxima acción */}
          <DashboardList
            title="Activas sin próxima acción"
            icon={<CircleDashed className="h-4 w-4 text-amber-500 dark:text-amber-400" />}
            count={noNextAction.data?.length ?? 0}
            empty="Todas las activas tienen próxima acción."
          >
            {noNextAction.data?.map((o) => (
              <Link
                key={o.id}
                href={`/oportunidades/${o.id}`}
                className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{o.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {o.organization?.name}
                  </p>
                </div>
                <StageBadge stage={o.stage} />
              </Link>
            ))}
          </DashboardList>
        </div>
      </div>
    </>
  )
}

function DashboardList({
  title,
  icon,
  count,
  empty,
  children,
}: {
  title: string
  icon: React.ReactNode
  count: number
  empty: string
  children: React.ReactNode
}) {
  const hasItems = count > 0
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {title}
        </CardTitle>
        <Badge variant="secondary">{count}</Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {hasItems ? (
          children
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {empty}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function ActivityRow({
  type,
  body,
  dueDate,
  oppTitle,
  oppId,
  overdue,
}: {
  type: Enums<"activity_type">
  body: string | null
  dueDate: string | null
  oppTitle?: string | null
  oppId?: string | null
  overdue?: boolean
}) {
  const content = (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm hover:bg-muted/50">
      <div className="min-w-0">
        <p className="truncate font-medium">{body || "—"}</p>
        <p className="truncate text-xs text-muted-foreground">
          {ACTIVITY_TYPE_LABELS[type]}
          {oppTitle ? ` · ${oppTitle}` : ""}
        </p>
      </div>
      <span
        className={`shrink-0 text-xs ${overdue ? "text-destructive" : "text-muted-foreground"}`}
      >
        {formatDateShort(dueDate)}
      </span>
    </div>
  )
  return oppId ? <Link href={`/oportunidades/${oppId}`}>{content}</Link> : content
}
