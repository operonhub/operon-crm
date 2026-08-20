/**
 * Consultas del panel operativo. Todas se lanzan en paralelo y se arman las
 * vistas en memoria: el dataset de una agencia de dos personas es chico y así
 * evitamos N+1 contra Supabase.
 */
import { createClient } from "@/lib/supabase/server"
import { ACTIVE_PROJECT_STATUSES, ACTIVE_STAGES } from "@/lib/constants"
import { todayISO, toISODate } from "@/lib/format"
import { financialStatus, summarizeFinances, type MoneyByCurrency } from "@/lib/finance"
import {
  activityKind,
  compareAlerts,
  compareProjects,
  compareTasks,
  groupAgenda,
  isTaskBlocked,
  isTaskOpen,
  isTaskOverdue,
  nextOpenTask,
  projectAlertReason,
  projectHealth,
  taskBucket,
  taskProgress,
  type AgendaGroups,
  type AgendaItem,
  type DashboardAlert,
  type ProjectHealth,
  type TaskBucket,
  type TaskProgress,
} from "@/lib/dashboard/utils"
import type { Enums } from "@/lib/supabase/types"
import type { FinancialRecordType, ProjectArea, SupportedCurrency } from "@/lib/constants"

/** "mine" limita todo el panel a lo que tiene asignado el usuario actual. */
export type DashboardScope = "mine" | "team"

export function parseScope(value: string | undefined): DashboardScope {
  return value === "mine" ? "mine" : "team"
}

export type DashboardProject = {
  id: string
  name: string
  type: Enums<"service_type">
  area: ProjectArea
  status: Enums<"project_status">
  dueDate: string | null
  clientName: string | null
  ownerName: string | null
  progress: TaskProgress
  pending: number
  blocked: number
  overdue: number
  health: ProjectHealth
  nextTaskTitle: string | null
}

export type DashboardTask = {
  id: string
  source: "project_task" | "activity"
  title: string
  status: Enums<"task_status">
  priority: Enums<"priority_level">
  dueDate: string | null
  projectId: string | null
  projectName: string
  clientName: string | null
  ownerName: string | null
  bucket: TaskBucket
  href: string | null
}

export type DashboardClient = {
  id: string
  name: string
  organizationId: string | null
  ownerName: string | null
  projects: { id: string; name: string; status: Enums<"project_status"> }[]
  nextDelivery: { name: string; dueDate: string } | null
}

export type DashboardSummary = {
  activeProjects: number
  activeClients: number
  tasksToday: number
  needsAttention: number
  pendingReceivables: MoneyByCurrency
}

export type DashboardData = {
  today: string
  summary: DashboardSummary
  alerts: DashboardAlert[]
  projects: DashboardProject[]
  tasks: DashboardTask[]
  agenda: AgendaGroups
  clients: DashboardClient[]
}

/** Filas crudas que devuelve Supabase, ya acotadas a lo que usamos. */
type RawTask = {
  id: string
  title: string
  status: Enums<"task_status">
  priority: Enums<"priority_level">
  due_date: string | null
  position: number
}

function logError(label: string, error: { message: string } | null) {
  if (error) console.error(`[dashboard] ${label}: ${error.message}`)
}

export async function getDashboardData(
  scope: DashboardScope,
  userId: string
): Promise<DashboardData> {
  const supabase = await createClient()
  const today = todayISO()
  const mine = scope === "mine"

  let projectsQuery = supabase
    .from("projects")
    .select(
      `id, name, type, area, status, due_date,
       client:clients(id, organization:organizations(id, name)),
       owner:profiles!projects_owner_id_fkey(full_name),
       project_tasks(id, title, status, priority, due_date, position)`
    )
    .in("status", ACTIVE_PROJECT_STATUSES)
  if (mine) projectsQuery = projectsQuery.eq("owner_id", userId)

  let tasksQuery = supabase
    .from("project_tasks")
    .select(
      `id, title, status, priority, due_date, position, project_id,
       project:projects(id, name, status,
         client:clients(organization:organizations(name))),
       owner:profiles!project_tasks_owner_id_fkey(full_name)`
    )
    .neq("status", "completada")
  if (mine) tasksQuery = tasksQuery.eq("owner_id", userId)

  let clientsQuery = supabase
    .from("clients")
    .select(
      `id, status,
       organization:organizations(id, name),
       owner:profiles!clients_owner_id_fkey(full_name),
       projects(id, name, status, due_date)`
    )
    .eq("status", "activo")
  if (mine) clientsQuery = clientsQuery.eq("owner_id", userId)

  let activitiesQuery = supabase
    .from("activities")
    .select(
      `id, type, body, due_date, completed, owner_id,
       opportunity:opportunities(id, title,
         organization:organizations(name)),
       project:projects(id, name,
         client:clients(organization:organizations(name))),
       owner:profiles!activities_owner_id_fkey(full_name)`
    )
    .eq("completed", false)
  if (mine) activitiesQuery = activitiesQuery.eq("owner_id", userId)

  let opportunitiesQuery = supabase
    .from("opportunities")
    .select("id, title, next_action, next_action_date, organization:organizations(name)")
    .in("stage", ACTIVE_STAGES)
  if (mine) opportunitiesQuery = opportunitiesQuery.eq("owner_id", userId)

  const financeQuery = supabase
    .from("financial_records")
    .select(
      `id, record_type, concept, currency, total_amount, paid_amount, due_date,
       paid_at, canceled_at, client_id, project_id,
       client:clients(organization:organizations(name)),
       project:projects(name)`
    )

  const automationsQuery = supabase
    .from("automations")
    .select("id, name, last_result, last_run_at, project_id, project:projects(id, name)")
    .not("last_result", "is", null)

  const [projectsRes, tasksRes, clientsRes, activitiesRes, opportunitiesRes, financeRes, automationsRes] =
    await Promise.all([
      projectsQuery,
      tasksQuery,
      clientsQuery,
      activitiesQuery,
      opportunitiesQuery,
      financeQuery,
      automationsQuery,
    ])

  logError("proyectos", projectsRes.error)
  logError("tareas", tasksRes.error)
  logError("clientes", clientsRes.error)
  logError("actividades", activitiesRes.error)
  logError("oportunidades", opportunitiesRes.error)
  logError("finanzas", financeRes.error)
  logError("automatizaciones", automationsRes.error)

  // ------------------------------------------------------------ proyectos
  const projects: DashboardProject[] = (projectsRes.data ?? []).map((p) => {
    const tasks = (p.project_tasks ?? []) as RawTask[]
    const health = projectHealth(p, tasks, today)
    const next = nextOpenTask(tasks, today)
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      area: p.area as ProjectArea,
      status: p.status,
      dueDate: toISODate(p.due_date),
      clientName: p.client?.organization?.name ?? null,
      ownerName: p.owner?.full_name ?? null,
      progress: taskProgress(tasks),
      pending: tasks.filter(isTaskOpen).length,
      blocked: tasks.filter(isTaskBlocked).length,
      overdue: tasks.filter((t) => isTaskOverdue(t, today)).length,
      health,
      nextTaskTitle: next?.title ?? null,
    }
  })
  projects.sort((a, b) =>
    compareProjects(
      { health: a.health, due_date: a.dueDate },
      { health: b.health, due_date: b.dueDate }
    )
  )

  const activeProjectIds = new Set(projects.map((p) => p.id))

  // --------------------------------------------------------------- tareas
  // Sólo tareas de proyectos en curso: las de un proyecto pausado o cerrado
  // no son trabajo del día.
  const projectTasks: DashboardTask[] = (tasksRes.data ?? [])
    .filter((t) => t.project && ACTIVE_PROJECT_STATUSES.includes(t.project.status))
    .map((t) => ({
      id: t.id,
      source: "project_task" as const,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: toISODate(t.due_date),
      projectId: t.project_id,
      projectName: t.project?.name ?? "—",
      clientName: t.project?.client?.organization?.name ?? null,
      ownerName: t.owner?.full_name ?? null,
      bucket: taskBucket(t, today),
      href: `/proyectos/${t.project_id}`,
    }))

  const taskKeys = new Set(
    projectTasks.map((task) =>
      `${task.title.trim().toLocaleLowerCase("es")}::${task.dueDate ?? ""}::${task.projectId ?? ""}`
    )
  )
  const activityTasks: DashboardTask[] = (activitiesRes.data ?? [])
    .filter((activity) => activity.type === "tarea")
    .map((activity) => {
      const projectId = activity.project?.id ?? null
      return {
        id: activity.id,
        source: "activity" as const,
        title: activity.body?.trim() || "Tarea sin descripción",
        status: "pendiente" as const,
        priority: "media" as const,
        dueDate: toISODate(activity.due_date),
        projectId,
        projectName: activity.project?.name ?? activity.opportunity?.title ?? "Actividad general",
        clientName:
          activity.project?.client?.organization?.name ??
          activity.opportunity?.organization?.name ??
          null,
        ownerName: activity.owner?.full_name ?? null,
        bucket: taskBucket(
          { status: "pendiente", priority: "media", due_date: activity.due_date },
          today
        ),
        href: projectId
          ? `/proyectos/${projectId}`
          : activity.opportunity
            ? `/oportunidades/${activity.opportunity.id}`
            : null,
      }
    })
    .filter((task) => {
      const key = `${task.title.trim().toLocaleLowerCase("es")}::${task.dueDate ?? ""}::${task.projectId ?? ""}`
      return !taskKeys.has(key)
    })

  const tasks = [...projectTasks, ...activityTasks]
  tasks.sort((a, b) =>
    compareTasks(
      { status: a.status, priority: a.priority, due_date: a.dueDate },
      { status: b.status, priority: b.priority, due_date: b.dueDate },
      today
    )
  )

  // ------------------------------------------------------------- clientes
  const clients: DashboardClient[] = (clientsRes.data ?? [])
    .map((c) => {
      const active = (c.projects ?? []).filter((p) =>
        ACTIVE_PROJECT_STATUSES.includes(p.status)
      )
      const withDue = active
        .filter((p) => p.due_date)
        .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
      const next = withDue[0]
      return {
        id: c.id,
        name: c.organization?.name ?? "Cliente sin organización",
        organizationId: c.organization?.id ?? null,
        ownerName: c.owner?.full_name ?? null,
        projects: active.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
        })),
        nextDelivery: next
          ? { name: next.name, dueDate: toISODate(next.due_date)! }
          : null,
      }
    })
    // Primero los que tienen entrega más cercana, después el resto.
    .sort((a, b) => {
      if (a.nextDelivery && b.nextDelivery) {
        return a.nextDelivery.dueDate < b.nextDelivery.dueDate ? -1 : 1
      }
      if (a.nextDelivery) return -1
      if (b.nextDelivery) return 1
      return a.name.localeCompare(b.name, "es")
    })

  // --------------------------------------------------------------- agenda
  const agendaItems: AgendaItem[] = []

  for (const a of activitiesRes.data ?? []) {
    if (a.type === "tarea") continue
    const date = toISODate(a.due_date)
    if (!date) continue
    agendaItems.push({
      id: `activity-${a.id}`,
      kind: activityKind(a.type),
      title: a.body?.trim() || "Actividad sin descripción",
      date,
      context:
        a.opportunity?.title ?? a.project?.name ?? a.opportunity?.organization?.name ?? null,
      href: a.opportunity
        ? `/oportunidades/${a.opportunity.id}`
        : a.project
          ? `/proyectos/${a.project.id}`
          : null,
    })
  }

  for (const t of tasks) {
    if (!t.dueDate) continue
    agendaItems.push({
      id: `task-${t.id}`,
      kind: "tarea",
      title: t.title,
      date: t.dueDate,
      context: t.projectName,
      href: t.href,
    })
  }

  for (const p of projects) {
    if (!p.dueDate) continue
    agendaItems.push({
      id: `delivery-${p.id}`,
      kind: "entrega",
      title: `Entrega de ${p.name}`,
      date: p.dueDate,
      context: p.clientName,
      href: `/proyectos/${p.id}`,
    })
  }

  const agenda = groupAgenda(agendaItems, today)

  // -------------------------------------------------------------- alertas
  const alerts: DashboardAlert[] = []

  for (const p of projects) {
    const reason = projectAlertReason(
      p.health,
      { dueDate: p.dueDate, overdueTasks: p.overdue, blockedTasks: p.blocked },
      today
    )
    if (!reason) continue
    alerts.push({
      id: `project-${p.id}`,
      severity: reason.severity,
      title: reason.title,
      context: [p.name, p.clientName].filter(Boolean).join(" · "),
      href: `/proyectos/${p.id}`,
    })
  }

  const overdueActivities = (activitiesRes.data ?? []).filter((a) => {
    if (a.type === "tarea") return false
    const due = toISODate(a.due_date)
    return due !== null && due < today
  }).length
  if (overdueActivities > 0) {
    alerts.push({
      id: "activities-overdue",
      severity: "critico",
      title:
        overdueActivities === 1
          ? "1 actividad comercial vencida"
          : `${overdueActivities} actividades comerciales vencidas`,
      context: "Pipeline",
      href: "/oportunidades",
    })
  }

  const missingNextAction = (opportunitiesRes.data ?? []).filter(
    (opportunity) => !opportunity.next_action?.trim() || !opportunity.next_action_date
  )
  if (missingNextAction.length > 0) {
    alerts.push({
      id: "opportunities-missing-next-action",
      severity: "critico",
      title:
        missingNextAction.length === 1
          ? "1 oportunidad activa sin próxima acción"
          : `${missingNextAction.length} oportunidades activas sin próxima acción`,
      context: "Pipeline",
      href: "/oportunidades",
    })
  }

  const staleOpportunities = (opportunitiesRes.data ?? []).filter(
    (opportunity) =>
      opportunity.next_action_date !== null && opportunity.next_action_date < today
  )
  if (staleOpportunities.length > 0) {
    alerts.push({
      id: "opportunities-overdue",
      severity: "aviso",
      title: staleOpportunities.length === 1
        ? "1 próxima acción comercial vencida"
        : `${staleOpportunities.length} próximas acciones comerciales vencidas`,
      context: "Pipeline",
      href: "/oportunidades",
    })
  }

  const financialRecords = (financeRes.data ?? []).map((record) => ({
    ...record,
    record_type: record.record_type as FinancialRecordType,
    currency: record.currency as SupportedCurrency,
  }))
  for (const record of financialRecords) {
    if (record.record_type !== "income" || financialStatus(record, today) !== "overdue") continue
    alerts.push({
      id: `finance-${record.id}`,
      severity: "critico",
      title: `Cobro vencido: ${record.concept}`,
      context: record.client?.organization?.name ?? record.project?.name ?? "Finanzas",
      href: "/finanzas",
    })
  }

  const visibleAutomationProjectIds = new Set(projects.map((project) => project.id))
  for (const automation of automationsRes.data ?? []) {
    if (mine && automation.project_id && !visibleAutomationProjectIds.has(automation.project_id)) continue
    if (!/error|fail|fall[oó]|failed/i.test(automation.last_result ?? "")) continue
    alerts.push({
      id: `automation-${automation.id}`,
      severity: "aviso",
      title: `Automatización con último resultado fallido: ${automation.name}`,
      context: automation.project?.name ?? "Automatizaciones",
      href: automation.project_id ? `/proyectos/${automation.project_id}` : "/proyectos",
    })
  }

  alerts.sort(compareAlerts)

  // -------------------------------------------------------------- resumen
  const summary: DashboardSummary = {
    activeProjects: activeProjectIds.size,
    activeClients: clients.length,
    tasksToday: tasks.filter((t) => t.bucket === "hoy").length,
    needsAttention: alerts.length,
    pendingReceivables: summarizeFinances(financialRecords, today).pending,
  }

  return { today, summary, alerts, projects, tasks, agenda, clients }
}

/** Datos mínimos para poblar los selects del menú "Crear". */
export async function getQuickCreateOptions() {
  const supabase = await createClient()

  const [profilesRes, projectsRes, clientsRes, orgsRes, opportunitiesRes] =
    await Promise.all([
      supabase.from("profiles").select("id, full_name").order("full_name"),
      supabase
        .from("projects")
        .select("id, name")
        .in("status", ACTIVE_PROJECT_STATUSES)
        .order("name"),
      supabase
        .from("clients")
        .select("id, organization:organizations(name)")
        .eq("status", "activo"),
      supabase.from("organizations").select("id, name").order("name"),
      supabase
        .from("opportunities")
        .select("id, title")
        .in("stage", ACTIVE_STAGES)
        .order("title"),
    ])

  return {
    profiles: profilesRes.data ?? [],
    projects: projectsRes.data ?? [],
    clients: (clientsRes.data ?? []).map((c) => ({
      id: c.id,
      name: c.organization?.name ?? "Cliente sin organización",
    })),
    organizations: orgsRes.data ?? [],
    opportunities: opportunitiesRes.data ?? [],
  }
}

export type QuickCreateOptions = Awaited<ReturnType<typeof getQuickCreateOptions>>
