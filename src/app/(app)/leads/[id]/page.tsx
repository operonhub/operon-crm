import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Building2, Mail, Phone, Target } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { SourceBadge, LeadStatusBadge } from "@/components/lead-badges"
import { ConvertLeadDialog } from "@/components/leads/convert-dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SERVICE_TYPE_LABELS } from "@/lib/constants"
import { formatDate } from "@/lib/format"

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: lead } = await supabase
    .from("leads")
    .select(
      `id, source, source_url, service_interest, status, segment, notes, created_at,
       organization:organizations(id, name, domain, website, industry, city),
       contact:contacts(id, full_name, title, email, phone),
       owner:profiles!leads_owner_id_fkey(full_name),
       campaign:campaigns(name)`
    )
    .eq("id", id)
    .maybeSingle()

  if (!lead) notFound()

  // Oportunidad ya creada desde este lead (si fue convertido).
  const { data: opp } = await supabase
    .from("opportunities")
    .select("id, title, stage")
    .eq("lead_id", id)
    .maybeSingle()

  const defaultTitle = lead.service_interest
    ? `${SERVICE_TYPE_LABELS[lead.service_interest]} - ${lead.organization?.name ?? ""}`.trim()
    : (lead.organization?.name ?? "Nueva oportunidad")

  return (
    <>
      <PageHeader title={lead.organization?.name ?? "Lead"}>
        {opp ? (
          <Button
            variant="outline"
            render={<Link href={`/oportunidades/${opp.id}`} />}
          >
            <Target className="mr-1 h-4 w-4" />
            Ver oportunidad
          </Button>
        ) : (
          <ConvertLeadDialog leadId={lead.id} defaultTitle={defaultTitle} />
        )}
      </PageHeader>

      <div className="space-y-4 p-6">
        <Link
          href="/leads"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a leads
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <LeadStatusBadge status={lead.status} />
          <SourceBadge source={lead.source} />
          {lead.service_interest && (
            <span className="text-sm text-muted-foreground">
              {SERVICE_TYPE_LABELS[lead.service_interest]}
            </span>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4" /> Empresa
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Field label="Nombre" value={lead.organization?.name} />
              <Field label="Web" value={lead.organization?.website || lead.organization?.domain} />
              <Field label="Industria" value={lead.organization?.industry} />
              <Field label="Ciudad" value={lead.organization?.city} />
              <Field label="Segmento / ICP" value={lead.segment} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Contacto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {lead.contact ? (
                <>
                  <Field label="Nombre" value={lead.contact.full_name} />
                  <Field label="Cargo" value={lead.contact.title} />
                  <Field
                    label="Email"
                    value={lead.contact.email}
                    icon={<Mail className="h-3 w-3" />}
                  />
                  <Field
                    label="Teléfono"
                    value={lead.contact.phone}
                    icon={<Phone className="h-3 w-3" />}
                  />
                </>
              ) : (
                <p className="text-muted-foreground">Sin contacto cargado.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Detalle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Field label="Responsable" value={lead.owner?.full_name} />
            <Field label="Campaña" value={lead.campaign?.name} />
            <Field label="URL de origen" value={lead.source_url} />
            <Field label="Creado" value={formatDate(lead.created_at)} />
            {lead.notes && (
              <div className="pt-2">
                <p className="text-xs text-muted-foreground">Notas</p>
                <p className="whitespace-pre-wrap">{lead.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function Field({
  label,
  value,
  icon,
}: {
  label: string
  value?: string | null
  icon?: React.ReactNode
}) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1 text-right font-medium">
        {icon}
        {value || "—"}
      </span>
    </div>
  )
}
