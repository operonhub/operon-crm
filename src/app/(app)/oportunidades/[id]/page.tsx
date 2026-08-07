import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Building2, User } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { FolderKanban } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StageControl } from "@/components/opportunities/stage-control"
import { EditOpportunityDialog } from "@/components/opportunities/edit-dialog"
import { WinDialog } from "@/components/opportunities/win-dialog"
import {
  ActivityPanel,
  type Activity,
} from "@/components/opportunities/activity-panel"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { SERVICE_TYPE_LABELS } from "@/lib/constants"
import { formatDate, formatMoney, isOverdue } from "@/lib/format"

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: opp } = await supabase
    .from("opportunities")
    .select(
      `id, title, stage, service_type, estimated_value, currency, probability,
       next_action, next_action_date, expected_close_date, lost_reason,
       organization:organizations(id, name, domain),
       contact:contacts(full_name, email, phone),
       owner:profiles!opportunities_owner_id_fkey(full_name)`
    )
    .eq("id", id)
    .maybeSingle()

  if (!opp) notFound()

  const { data: activities } = await supabase
    .from("activities")
    .select("id, type, body, due_date, completed, created_at")
    .eq("opportunity_id", id)
    .order("created_at", { ascending: false })

  // Proyecto ya creado desde esta oportunidad (si fue ganada).
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("opportunity_id", id)
    .maybeSingle()

  return (
    <>
      <PageHeader title={opp.title}>
        {project ? (
          <Button variant="outline" render={<Link href={`/proyectos/${project.id}`} />}>
            <FolderKanban className="mr-1 h-4 w-4" />
            Ver proyecto
          </Button>
        ) : (
          <WinDialog
            opportunityId={opp.id}
            defaultName={opp.title}
            defaultType={opp.service_type}
          />
        )}
        <EditOpportunityDialog
          opp={{
            id: opp.id,
            estimated_value: opp.estimated_value,
            probability: opp.probability,
            next_action: opp.next_action,
            next_action_date: opp.next_action_date,
            expected_close_date: opp.expected_close_date,
          }}
        />
        <StageControl oppId={opp.id} currentStage={opp.stage} />
      </PageHeader>

      <div className="space-y-4 p-6">
        <Link
          href="/oportunidades"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al pipeline
        </Link>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Columna izquierda: datos */}
          <div className="space-y-4 lg:col-span-1">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Resumen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <Field
                  label="Valor"
                  value={formatMoney(opp.estimated_value, opp.currency)}
                />
                <Field
                  label="Probabilidad"
                  value={opp.probability != null ? `${opp.probability}%` : "—"}
                />
                <Field
                  label="Servicio"
                  value={
                    opp.service_type
                      ? SERVICE_TYPE_LABELS[opp.service_type]
                      : "—"
                  }
                />
                <Field
                  label="Cierre estimado"
                  value={formatDate(opp.expected_close_date)}
                />
                <Field label="Responsable" value={opp.owner?.full_name} />
                {opp.stage === "perdido" && (
                  <Field label="Motivo de pérdida" value={opp.lost_reason} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Building2 className="h-4 w-4" /> Empresa & contacto
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <Field label="Empresa" value={opp.organization?.name} />
                {opp.contact && (
                  <>
                    <Field
                      label="Contacto"
                      value={opp.contact.full_name}
                    />
                    <Field label="Email" value={opp.contact.email} />
                    <Field label="Teléfono" value={opp.contact.phone} />
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Columna derecha: próxima acción + actividades */}
          <div className="space-y-4 lg:col-span-2">
            <Card
              className={
                isOverdue(opp.next_action_date)
                  ? "ring-2 ring-destructive/40"
                  : undefined
              }
            >
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>Próxima acción</span>
                  {opp.next_action_date && (
                    <Badge
                      variant={
                        isOverdue(opp.next_action_date)
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {formatDate(opp.next_action_date)}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {opp.next_action ? (
                  <p>{opp.next_action}</p>
                ) : (
                  <p className="text-muted-foreground">
                    Sin próxima acción definida. Cambiá la etapa para asignar
                    una.
                  </p>
                )}
              </CardContent>
            </Card>

            <div>
              <div className="mb-2 flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium">Actividad</h2>
              </div>
              <ActivityPanel
                opportunityId={opp.id}
                activities={(activities ?? []) as Activity[]}
              />
            </div>
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
