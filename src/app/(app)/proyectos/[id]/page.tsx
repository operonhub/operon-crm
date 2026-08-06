import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink, Zap } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { ServiceTypeBadge } from "@/components/project-badges"
import { ProjectStatusControl } from "@/components/projects/status-control"
import { LinksDialog, type ProjectLinks } from "@/components/projects/links-dialog"
import { TaskList, type Task } from "@/components/projects/task-list"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AUTOMATION_STATUS_LABELS } from "@/lib/constants"
import { formatDate } from "@/lib/format"

const LINK_LABELS: Record<string, string> = {
  figma: "Figma",
  repo: "Repositorio",
  staging: "Staging",
  prod: "Producción",
  analytics: "Analytics",
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
      `id, name, type, status, scope, conversion_goal, kpi, start_date, due_date, links,
       client:clients(id, organization:organizations(id, name)),
       owner:profiles!projects_owner_id_fkey(full_name),
       opportunity:opportunities(id, title)`
    )
    .eq("id", id)
    .maybeSingle()

  if (!project) notFound()

  const [{ data: tasks }, { data: automations }] = await Promise.all([
    supabase
      .from("project_tasks")
      .select("id, title, status, priority")
      .eq("project_id", id)
      .order("position"),
    supabase
      .from("automations")
      .select("id, name, n8n_url, environment, status, secret_ref")
      .eq("project_id", id),
  ])

  const links = (project.links ?? {}) as ProjectLinks
  const linkEntries = Object.entries(links).filter(([, v]) => v)

  return (
    <>
      <PageHeader title={project.name}>
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
          {project.client?.organization && (
            <Link
              href={`/organizaciones/${project.client.organization.id}`}
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
                        {a.secret_ref && <span>🔒 {a.secret_ref}</span>}
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

          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Checklist</CardTitle>
              </CardHeader>
              <CardContent>
                <TaskList
                  projectId={project.id}
                  tasks={(tasks ?? []) as Task[]}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || "—"}</span>
    </div>
  )
}
