import Link from "next/link"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { PROJECT_AREA_LABELS } from "@/lib/constants"
import { formatDateShort, relativeDayLabel } from "@/lib/format"
import type { ProjectHealth } from "@/lib/dashboard/utils"
import type { DashboardProject } from "@/lib/dashboard/queries"
import { EmptyLine } from "@/components/dashboard/section"

const HEALTH: Record<ProjectHealth, { label: string; className: string }> = {
  atrasado: {
    label: "Atrasado",
    className: "bg-destructive/10 text-destructive",
  },
  bloqueado: {
    label: "Bloqueado",
    className: "bg-destructive/10 text-destructive",
  },
  atencion: {
    label: "Requiere atención",
    className:
      "bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400",
  },
  revision: {
    label: "Esperando revisión",
    className: "bg-primary/10 text-primary",
  },
  en_orden: {
    label: "En orden",
    className: "bg-muted text-muted-foreground",
  },
}

export function ActiveProjects({
  projects,
  today,
}: {
  projects: DashboardProject[]
  today: string
}) {
  if (projects.length === 0) {
    return (
      <EmptyLine>
        No hay proyectos en curso. Se crean al ganar una oportunidad o desde
        Crear → Nuevo proyecto.
      </EmptyLine>
    )
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      {projects.map((project, index) => (
        <ProjectRow
          key={project.id}
          project={project}
          today={today}
          className={index > 0 ? "border-t" : undefined}
        />
      ))}
    </Card>
  )
}

function ProjectRow({
  project,
  today,
  className,
}: {
  project: DashboardProject
  today: string
  className?: string
}) {
  const health = HEALTH[project.health]
  const { pct, done, total } = project.progress
  const overdueDelivery =
    project.dueDate !== null && project.dueDate < today

  return (
    <Link
      href={`/proyectos/${project.id}`}
      className={cn(
        "block px-4 py-3.5 transition-colors hover:bg-muted/50",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">{project.name}</h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[
              project.clientName,
              PROJECT_AREA_LABELS[project.area],
              project.ownerName,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-md px-2 py-0.5 font-mono text-[10px] tracking-wide uppercase",
            health.className
          )}
        >
          {health.label}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Avance de ${project.name}`}
          className="h-1.5 w-full max-w-32 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {total > 0 ? `${pct}% · ${done}/${total}` : "Sin tareas"}
        </span>
        {project.dueDate && (
          <span
            className={cn(
              "ml-auto shrink-0 text-xs",
              overdueDelivery ? "text-destructive" : "text-muted-foreground"
            )}
          >
            Entrega {formatDateShort(project.dueDate)}
            <span className="hidden sm:inline">
              {" "}
              ({relativeDayLabel(project.dueDate, today)})
            </span>
          </span>
        )}
      </div>

      {(project.nextTaskTitle || project.pending > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {project.nextTaskTitle && (
            <span className="min-w-0 truncate text-muted-foreground">
              <span className="text-foreground/70">Próximo:</span>{" "}
              {project.nextTaskTitle}
            </span>
          )}
          <span className="ml-auto shrink-0 font-mono tabular-nums text-muted-foreground">
            {project.pending} pendiente{project.pending === 1 ? "" : "s"}
            {project.blocked > 0 && (
              <span className="text-destructive">
                {" · "}
                {project.blocked} bloqueada{project.blocked === 1 ? "" : "s"}
              </span>
            )}
          </span>
        </div>
      )}
    </Link>
  )
}
