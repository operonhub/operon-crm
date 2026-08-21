/**
 * Lógica pura del panel operativo: salud de proyectos, prioridad de tareas y
 * agrupación de agenda. Sin acceso a datos ni a React, para poder testearla.
 */
import { daysBetweenISO, toISODate } from "@/lib/format"
import type { Enums } from "@/lib/supabase/types"

/** Ventana en días para considerar que una entrega está "cerca". */
export const DELIVERY_SOON_DAYS = 7

// ---------------------------------------------------------------- tareas

export type TaskLike = {
  status: Enums<"task_status">
  priority: Enums<"priority_level">
  due_date: string | null
  position?: number
}

export function isTaskOpen(task: Pick<TaskLike, "status">): boolean {
  return task.status !== "completada"
}

export function isTaskBlocked(task: Pick<TaskLike, "status">): boolean {
  return task.status === "bloqueada"
}

/** Tarea sin completar cuya fecha de vencimiento ya pasó. */
export function isTaskOverdue(task: TaskLike, today: string): boolean {
  const due = toISODate(task.due_date)
  return isTaskOpen(task) && due !== null && due < today
}

export type TaskProgress = { total: number; done: number; pct: number }

export function taskProgress(tasks: Pick<TaskLike, "status">[]): TaskProgress {
  const total = tasks.length
  const done = tasks.filter((t) => t.status === "completada").length
  // Un proyecto sin tareas no es 100%: es 0% y sin información de avance.
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return { total, done, pct }
}

/** Buckets de la lista de tareas, en el orden en que se muestran. */
export type TaskBucket = "vencida" | "hoy" | "bloqueada" | "proxima" | "sin_fecha"

const TASK_BUCKET_ORDER: TaskBucket[] = [
  "vencida",
  "hoy",
  "bloqueada",
  "proxima",
  "sin_fecha",
]

export function taskBucket(task: TaskLike, today: string): TaskBucket {
  const due = toISODate(task.due_date)
  if (due && due < today) return "vencida"
  if (due === today) return "hoy"
  if (isTaskBlocked(task)) return "bloqueada"
  if (due) return "proxima"
  return "sin_fecha"
}

const PRIORITY_WEIGHT: Record<Enums<"priority_level">, number> = {
  urgente: 0,
  alta: 1,
  media: 2,
  baja: 3,
}

/** Vencidas → hoy → bloqueadas → próximas por fecha → sin fecha. */
export function compareTasks(a: TaskLike, b: TaskLike, today: string): number {
  const bucketDiff =
    TASK_BUCKET_ORDER.indexOf(taskBucket(a, today)) -
    TASK_BUCKET_ORDER.indexOf(taskBucket(b, today))
  if (bucketDiff !== 0) return bucketDiff

  const dueA = toISODate(a.due_date)
  const dueB = toISODate(b.due_date)
  if (dueA && dueB && dueA !== dueB) return dueA < dueB ? -1 : 1
  if (dueA && !dueB) return -1
  if (!dueA && dueB) return 1

  const priorityDiff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]
  if (priorityDiff !== 0) return priorityDiff

  return (a.position ?? 0) - (b.position ?? 0)
}

/** Próxima tarea relevante de un proyecto (la primera abierta ya priorizada). */
export function nextOpenTask<T extends TaskLike>(
  tasks: T[],
  today: string
): T | null {
  const open = tasks.filter(isTaskOpen)
  if (open.length === 0) return null
  return [...open].sort((a, b) => compareTasks(a, b, today))[0]
}

// ------------------------------------------------------------- proyectos

/**
 * Salud derivada de datos reales, sin columnas nuevas.
 * El orden de evaluación importa: gana siempre el problema más grave.
 */
export type ProjectHealth =
  | "atrasado"
  | "bloqueado"
  | "revision"
  | "atencion"
  | "en_orden"

export type ProjectLike = {
  status: Enums<"project_status">
  due_date: string | null
}

export function projectHealth(
  project: ProjectLike,
  tasks: TaskLike[],
  today: string
): ProjectHealth {
  const due = toISODate(project.due_date)
  const hasOverdueTask = tasks.some((t) => isTaskOverdue(t, today))

  if ((due && due < today) || hasOverdueTask) return "atrasado"
  if (tasks.some(isTaskBlocked)) return "bloqueado"
  if (project.status === "revision") return "revision"

  const pending = tasks.filter(isTaskOpen).length
  if (due && pending > 0 && daysBetweenISO(today, due) <= DELIVERY_SOON_DAYS) {
    return "atencion"
  }
  return "en_orden"
}

const HEALTH_RANK: Record<ProjectHealth, number> = {
  atrasado: 0,
  bloqueado: 1,
  atencion: 2,
  revision: 3,
  en_orden: 4,
}

export function healthRank(health: ProjectHealth): number {
  return HEALTH_RANK[health]
}

/** Atrasados → bloqueados → entregas más cercanas → resto. */
export function compareProjects(
  a: { health: ProjectHealth; due_date: string | null },
  b: { health: ProjectHealth; due_date: string | null }
): number {
  const rankDiff = healthRank(a.health) - healthRank(b.health)
  if (rankDiff !== 0) return rankDiff

  const dueA = toISODate(a.due_date)
  const dueB = toISODate(b.due_date)
  if (dueA && dueB && dueA !== dueB) return dueA < dueB ? -1 : 1
  if (dueA && !dueB) return -1
  if (!dueA && dueB) return 1
  return 0
}

// --------------------------------------------------------------- alertas

export type AlertSeverity = "critico" | "aviso" | "espera"

export type DashboardAlert = {
  id: string
  severity: AlertSeverity
  /** Qué pasa. Ej: "Entrega vencida hace 3 días". */
  title: string
  /** Dónde pasa. Ej: "Súper Todo · Panadería Don Carlos". */
  context: string
  href: string
  company?: string | null
  action?: string | null
  owner?: string | null
  dueDate?: string | null
}

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  critico: 0,
  aviso: 1,
  espera: 2,
}

export function compareAlerts(a: DashboardAlert, b: DashboardAlert): number {
  return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
}

/**
 * Motivo de alerta de un proyecto, o null si está en orden.
 * Un proyecto genera como mucho una alerta para no duplicar la misma señal.
 */
export function projectAlertReason(
  health: ProjectHealth,
  args: { dueDate: string | null; overdueTasks: number; blockedTasks: number },
  today: string
): { severity: AlertSeverity; title: string } | null {
  const due = toISODate(args.dueDate)
  const daysToDue = due ? daysBetweenISO(today, due) : null

  if (health === "atrasado") {
    if (daysToDue !== null && daysToDue < 0) {
      const days = Math.abs(daysToDue)
      return {
        severity: "critico",
        title:
          days === 1
            ? "Entrega vencida hace 1 día"
            : `Entrega vencida hace ${days} días`,
      }
    }
    return {
      severity: "critico",
      title:
        args.overdueTasks === 1
          ? "1 tarea vencida"
          : `${args.overdueTasks} tareas vencidas`,
    }
  }

  if (health === "bloqueado") {
    return {
      severity: "critico",
      title:
        args.blockedTasks === 1
          ? "1 tarea bloqueada"
          : `${args.blockedTasks} tareas bloqueadas`,
    }
  }

  if (health === "atencion" && daysToDue !== null) {
    return {
      severity: "aviso",
      title:
        daysToDue === 0
          ? "Entrega hoy"
          : daysToDue === 1
            ? "Entrega mañana"
            : `Entrega en ${daysToDue} días`,
    }
  }

  // "Esperando revisión" sólo alerta si además la entrega está encima; si no,
  // es un estado normal del flujo y alcanza con el badge del proyecto.
  if (
    health === "revision" &&
    daysToDue !== null &&
    daysToDue <= DELIVERY_SOON_DAYS
  ) {
    return { severity: "espera", title: "Esperando revisión del cliente" }
  }

  return null
}

// ---------------------------------------------------------------- agenda

export type AgendaKind = "reunion" | "llamada" | "seguimiento" | "tarea" | "entrega"

export type AgendaItem = {
  id: string
  kind: AgendaKind
  title: string
  date: string
  context: string | null
  /** null cuando el ítem no tiene un detalle al que navegar. */
  href: string | null
}

export type AgendaBucket = "hoy" | "manana" | "semana"

/** null = fuera de la ventana de la agenda (pasado o a más de 7 días). */
export function agendaBucket(
  value: string | null | undefined,
  today: string
): AgendaBucket | null {
  const iso = toISODate(value)
  if (!iso) return null
  const diff = daysBetweenISO(today, iso)
  if (diff < 0) return null
  if (diff === 0) return "hoy"
  if (diff === 1) return "manana"
  if (diff <= DELIVERY_SOON_DAYS) return "semana"
  return null
}

export function activityKind(type: Enums<"activity_type">): AgendaKind {
  if (type === "reunion") return "reunion"
  if (type === "llamada") return "llamada"
  return "seguimiento"
}

export type AgendaGroups = {
  hoy: AgendaItem[]
  manana: AgendaItem[]
  semana: AgendaItem[]
}

export function groupAgenda(items: AgendaItem[], today: string): AgendaGroups {
  const groups: AgendaGroups = { hoy: [], manana: [], semana: [] }
  for (const item of items) {
    const bucket = agendaBucket(item.date, today)
    if (bucket) groups[bucket].push(item)
  }
  for (const key of Object.keys(groups) as AgendaBucket[]) {
    groups[key].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  }
  return groups
}
