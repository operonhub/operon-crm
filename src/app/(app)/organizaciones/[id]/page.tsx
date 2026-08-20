import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, Mail, Phone } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { StageBadge } from "@/components/stage-badge"
import { LeadStatusBadge, SourceBadge } from "@/components/lead-badges"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMoney } from "@/lib/format"

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("organization_id", id)
    .maybeSingle()

  if (client) redirect(`/clientes/${client.id}`)

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, domain, website, industry, size, country, city, linkedin, notes")
    .eq("id", id)
    .maybeSingle()

  if (!org) notFound()

  const [{ data: contacts }, { data: leads }, { data: opps }] =
    await Promise.all([
      supabase
        .from("contacts")
        .select("id, full_name, title, email, phone")
        .eq("organization_id", id)
        .order("full_name"),
      supabase
        .from("leads")
        .select("id, source, status, service_interest")
        .eq("organization_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("opportunities")
        .select("id, title, stage, estimated_value, currency")
        .eq("organization_id", id)
        .order("created_at", { ascending: false }),
    ])

  return (
    <>
      <PageHeader
        title={org.name}
        description={org.domain ?? "Empresa o prospecto sin dominio cargado"}
      />
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href="/leads"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a Leads
          </Link>
          <Badge variant="outline">Prospecto</Badge>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Datos de la empresa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Field label="Web" value={org.website || org.domain} />
              <Field label="Industria" value={org.industry} />
              <Field label="Tamaño" value={org.size} />
              <Field label="Ciudad" value={org.city} />
              <Field label="País" value={org.country} />
              {org.notes && (
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground">Notas</p>
                  <p className="whitespace-pre-wrap">{org.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">
                  Contactos ({contacts?.length ?? 0})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {contacts && contacts.length > 0 ? (
                  contacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="flex flex-col gap-2 rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium">{contact.full_name}</p>
                        {contact.title && (
                          <p className="text-xs text-muted-foreground">
                            {contact.title}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:items-end">
                        {contact.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {contact.email}
                          </span>
                        )}
                        {contact.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {contact.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState text="Sin contactos." />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">
                  Oportunidades ({opps?.length ?? 0})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {opps && opps.length > 0 ? (
                  opps.map((opportunity) => (
                    <Link
                      key={opportunity.id}
                      href={`/oportunidades/${opportunity.id}`}
                      className="flex flex-col gap-2 rounded-md border p-3 text-sm hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="font-medium">{opportunity.title}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {formatMoney(
                            opportunity.estimated_value,
                            opportunity.currency
                          )}
                        </span>
                        <StageBadge stage={opportunity.stage} />
                      </div>
                    </Link>
                  ))
                ) : (
                  <EmptyState text="Sin oportunidades." />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">
                  Leads ({leads?.length ?? 0})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {leads && leads.length > 0 ? (
                  leads.map((lead) => (
                    <Link
                      key={lead.id}
                      href={`/leads/${lead.id}`}
                      className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-muted/50"
                    >
                      <SourceBadge source={lead.source} />
                      <LeadStatusBadge status={lead.status} />
                    </Link>
                  ))
                ) : (
                  <EmptyState text="Sin leads." />
                )}
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

function EmptyState({ text }: { text: string }) {
  return <p className="py-2 text-sm text-muted-foreground">{text}</p>
}
