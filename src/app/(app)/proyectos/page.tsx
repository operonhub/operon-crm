import Link from "next/link"
import { AlertTriangle, ArrowRight, CheckCircle2, Flag, ListChecks } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { ProjectCreateButton } from "@/components/projects/project-create-button"
import { getQuickCreateOptions } from "@/lib/dashboard/queries"
import { ProjectStatusBadge } from "@/components/project-badges"
import { Card } from "@/components/ui/card"
import {
  ACTIVE_PROJECT_STATUSES,
  PROJECT_AREAS,
  PROJECT_AREA_DESCRIPTIONS,
  PROJECT_AREA_LABELS,
  PROJECT_ENGAGEMENT_LABELS,
  type ProjectArea,
  type ProjectEngagement,
} from "@/lib/constants"
import {
  taskProgress,
  type TaskLike,
} from "@/lib/dashboard/utils"
import { formatDateShort, todayISO } from "@/lib/format"

const AREA_ACCENT: Record<ProjectArea, string> = {
  sites_ecommerce: "border-l-primary",
  apps_saas: "border-l-primary/55",
  automations_crm: "border-l-warning",
  assets_brand: "border-l-foreground/25",
}

export default async function ProyectosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; owner?: string; archived?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const [{ data, error }, quickOptions] = await Promise.all([
    supabase
      .from("projects")
      .select(
      `id, name, area, engagement_kind, operational_type, status, due_date, owner_id, archived_at,
       client:clients(organization:organizations(name)),
       owner:profiles!projects_owner_id_fkey(full_name),
       project_tasks(status, priority, due_date)`
      )
      .order("created_at", { ascending: false }),
    getQuickCreateOptions(),
  ])

  const today = todayISO()
  const allProjects = (data ?? []).map((project) => {
    const tasks = (project.project_tasks ?? []) as TaskLike[]
    const progress = taskProgress(tasks)
    return {
      ...project,
      area: project.area as ProjectArea,
      engagementKind: project.engagement_kind as ProjectEngagement,
      progress,
      pending: tasks.filter((task) => task.status !== "completada").length,
      blocked: tasks.filter((task) => task.status === "bloqueada").length,
    }
  })
  const query = params.q?.trim().toLocaleLowerCase("es") ?? ""
  const projects = allProjects.filter((project) => {
    const archived = params.archived ?? "active"
    if (archived === "active" && project.archived_at) return false
    if (archived === "archived" && !project.archived_at) return false
    if (params.status && params.status !== "all" && project.status !== params.status) return false
    if (params.owner && params.owner !== "all" && project.owner_id !== params.owner) return false
    if (query && !`${project.name} ${project.operational_type ?? ""} ${project.client?.organization?.name ?? ""}`.toLocaleLowerCase("es").includes(query)) return false
    return true
  })

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="label-mono text-primary">Entrega</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Proyectos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Las cuatro áreas de Operon, con trabajo interno y de clientes.</p>
        </div>
        <ProjectCreateButton options={quickOptions} />
      </div>
      <form className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_11rem_12rem_11rem_auto]">
        <input name="q" defaultValue={params.q} placeholder="Buscar proyecto" className="h-9 rounded-lg border bg-transparent px-3 text-sm" />
        <select name="status" defaultValue={params.status ?? "all"} className="h-9 rounded-lg border bg-transparent px-3 text-sm"><option value="all">Todos los estados</option><option value="discovery">Discovery</option><option value="en_progreso">En progreso</option><option value="revision">Revisión</option><option value="activo">Activo</option><option value="pausado">Pausado</option><option value="cerrado">Cerrado</option></select>
        <select name="owner" defaultValue={params.owner ?? "all"} className="h-9 rounded-lg border bg-transparent px-3 text-sm"><option value="all">Todo el equipo</option>{quickOptions.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}</select>
        <select name="archived" defaultValue={params.archived ?? "active"} className="h-9 rounded-lg border bg-transparent px-3 text-sm"><option value="active">Activos</option><option value="archived">Archivados</option><option value="all">Todos</option></select>
        <button className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Filtrar</button>
      </form>
        {error && (
          <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            No se pudo leer la estructura operativa de proyectos. Aplicá la migración nueva antes de continuar.
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PROJECT_AREAS.map((area) => {
            const areaProjects = projects.filter((project) => project.area === area)
            const active = areaProjects.filter((project) => ACTIVE_PROJECT_STATUSES.includes(project.status))
            const pending = active.reduce((sum, project) => sum + project.pending, 0)
            const blocked = active.reduce((sum, project) => sum + project.blocked, 0)
            const nextDue = active
              .filter((project) => project.due_date)
              .sort((a, b) => a.due_date!.localeCompare(b.due_date!))[0]

            return (
              <Card key={area} className={`gap-0 border-l-4 p-4 ${AREA_ACCENT[area]}`}>
                <h2 className="font-heading text-sm font-semibold">{PROJECT_AREA_LABELS[area]}</h2>
                <p className="mt-1 min-h-8 text-xs leading-4 text-muted-foreground">{PROJECT_AREA_DESCRIPTIONS[area]}</p>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-3">
                  <MiniStat label="Activos" value={active.length} />
                  <MiniStat label="Pendientes" value={pending} />
                  <MiniStat label="Bloqueos" value={blocked} danger={blocked > 0} />
                </div>
                <p className="mt-3 truncate text-xs text-muted-foreground">
                  {nextDue ? `Próxima entrega: ${formatDateShort(nextDue.due_date)}` : "Sin entregas próximas"}
                </p>
              </Card>
            )
          })}
        </div>

        {PROJECT_AREAS.map((area) => {
          const areaProjects = projects.filter((project) => project.area === area)
          return (
            <section key={area} aria-labelledby={`area-${area}`} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={`h-4 border-l-4 ${AREA_ACCENT[area]}`} aria-hidden="true" />
                <h2 id={`area-${area}`} className="font-heading text-sm font-semibold">{PROJECT_AREA_LABELS[area]}</h2>
                <span className="font-mono text-xs text-muted-foreground">{areaProjects.length}</span>
              </div>

              {areaProjects.length === 0 ? (
                <p className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
                  Todavía no hay proyectos en esta área.
                </p>
              ) : (
                <div className="grid gap-3 xl:grid-cols-2">
                  {areaProjects.map((project) => (
                    <Link key={project.id} href={`/proyectos/${project.id}`} className="group">
                      <Card className="h-full gap-0 p-0 transition-colors group-hover:bg-muted/30">
                        <div className="flex items-start justify-between gap-3 border-b px-4 py-3.5">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-semibold">{project.name}</h3>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {PROJECT_ENGAGEMENT_LABELS[project.engagementKind]}
                              {project.client?.organization?.name && ` · ${project.client.organization.name}`}
                              {project.operational_type && ` · ${project.operational_type}`}
                            </p>
                          </div>
                          <ProjectStatusBadge status={project.status} />
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-4">
                          <ProjectStat icon={ListChecks} label="Pendientes" value={project.pending} />
                          <ProjectStat icon={AlertTriangle} label="Bloqueadas" value={project.blocked} danger={project.blocked > 0} />
                          <ProjectStat icon={CheckCircle2} label="Progreso" value={`${project.progress.pct}%`} />
                          <ProjectStat icon={Flag} label="Entrega" value={project.due_date ? formatDateShort(project.due_date) : "Sin fecha"} danger={project.due_date ? project.due_date < today : false} />
                        </div>
                        <div className="flex items-center justify-between border-t px-4 py-2.5 text-xs text-muted-foreground">
                          <span>{project.owner?.full_name ?? "Sin responsable"}</span>
                          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )
        })}
    </div>
  )
}

function MiniStat({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <div><p className={`font-mono text-lg font-semibold tabular-nums ${danger ? "text-destructive" : ""}`}>{value}</p><p className="text-[10px] text-muted-foreground">{label}</p></div>
}

function ProjectStat({ icon: Icon, label, value, danger = false }: { icon: React.ElementType; label: string; value: string | number; danger?: boolean }) {
  return <div className="min-w-0"><p className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Icon className="h-3 w-3" />{label}</p><p className={`mt-1 truncate font-mono text-xs font-medium ${danger ? "text-destructive" : ""}`}>{value}</p></div>
}
