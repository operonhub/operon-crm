import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { ProjectStatusBadge, ServiceTypeBadge } from "@/components/project-badges"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate } from "@/lib/format"
import type { Enums } from "@/lib/supabase/types"

type TaskRow = { status: Enums<"task_status"> }

export default async function ProyectosPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from("projects")
    .select(
      `id, name, type, status, due_date,
       client:clients(organization:organizations(name)),
       owner:profiles!projects_owner_id_fkey(full_name),
       project_tasks(status)`
    )
    .order("created_at", { ascending: false })

  const projects = data ?? []

  return (
    <>
      <PageHeader
        title="Proyectos"
        description={`${projects.length} proyecto(s)`}
      />
      <div className="p-6">
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proyecto</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Progreso</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Entrega</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Todavía no hay proyectos. Se crean al marcar una oportunidad
                    como ganada.
                  </TableCell>
                </TableRow>
              ) : (
                projects.map((p) => {
                  const tasks = (p.project_tasks ?? []) as TaskRow[]
                  const total = tasks.length
                  const done = tasks.filter(
                    (t) => t.status === "completada"
                  ).length
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        <Link href={`/proyectos/${p.id}`} className="block">
                          {p.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.client?.organization?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <ServiceTypeBadge type={p.type} />
                      </TableCell>
                      <TableCell>
                        <ProjectStatusBadge status={p.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {done}/{total}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.owner?.full_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(p.due_date)}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  )
}
