import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Mail, Phone } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { StageBadge } from "@/components/stage-badge"
import { LeadStatusBadge, SourceBadge } from "@/components/lead-badges"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMoney } from "@/lib/format"

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

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
      <PageHeader title={org.name} description={org.domain ?? undefined} />
      <div className="space-y-4 p-6">
        <Link
          href="/organizaciones"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a organizaciones
        </Link>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Datos</CardTitle>
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
                  contacts.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-md border p-2 text-sm"
                    >
                      <div>
                        <p className="font-medium">{c.full_name}</p>
                        {c.title && (
                          <p className="text-xs text-muted-foreground">
                            {c.title}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground">
                        {c.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {c.email}
                          </span>
                        )}
                        {c.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {c.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="py-2 text-sm text-muted-foreground">
                    Sin contactos.
                  </p>
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
                  opps.map((o) => (
                    <Link
                      key={o.id}
                      href={`/oportunidades/${o.id}`}
                      className="flex items-center justify-between rounded-md border p-2 text-sm hover:bg-muted/50"
                    >
                      <span className="font-medium">{o.title}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {formatMoney(o.estimated_value, o.currency)}
                        </span>
                        <StageBadge stage={o.stage} />
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="py-2 text-sm text-muted-foreground">
                    Sin oportunidades.
                  </p>
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
                  leads.map((l) => (
                    <Link
                      key={l.id}
                      href={`/leads/${l.id}`}
                      className="flex items-center justify-between rounded-md border p-2 text-sm hover:bg-muted/50"
                    >
                      <SourceBadge source={l.source} />
                      <LeadStatusBadge status={l.status} />
                    </Link>
                  ))
                ) : (
                  <p className="py-2 text-sm text-muted-foreground">
                    Sin leads.
                  </p>
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
