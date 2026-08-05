import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getProfiles } from "@/lib/queries"
import { PageHeader } from "@/components/page-header"
import { LeadFilterBar } from "@/components/leads/filter-bar"
import { NewLeadDialog } from "@/components/leads/new-lead-dialog"
import { SourceBadge, LeadStatusBadge } from "@/components/lead-badges"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SERVICE_TYPE_LABELS } from "@/lib/constants"
import { formatDate } from "@/lib/format"
import type { Enums } from "@/lib/supabase/types"

type SearchParams = Promise<{ q?: string; status?: string; source?: string }>

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { q, status, source } = await searchParams
  const supabase = await createClient()
  const profiles = await getProfiles()

  let query = supabase
    .from("leads")
    .select(
      `id, source, service_interest, status, segment, created_at,
       organization:organizations(name, domain),
       contact:contacts(full_name, email),
       owner:profiles!leads_owner_id_fkey(full_name)`
    )
    .order("created_at", { ascending: false })

  if (status) query = query.eq("status", status as Enums<"lead_status">)
  if (source) query = query.eq("source", source as Enums<"lead_source">)

  const { data: leadsRaw } = await query

  // Búsqueda de texto (empresa/contacto) en memoria — dataset chico en MVP.
  const term = (q ?? "").toLowerCase().trim()
  const leads = (leadsRaw ?? []).filter((l) => {
    if (!term) return true
    return (
      l.organization?.name?.toLowerCase().includes(term) ||
      l.contact?.full_name?.toLowerCase().includes(term) ||
      l.contact?.email?.toLowerCase().includes(term)
    )
  })

  return (
    <>
      <PageHeader title="Leads" description={`${leads.length} lead(s)`}>
        <NewLeadDialog profiles={profiles} />
      </PageHeader>

      <div className="space-y-4 p-6">
        <LeadFilterBar />

        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Fuente</TableHead>
                <TableHead>Servicio</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Creado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No hay leads con estos filtros.
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((l) => (
                  <TableRow key={l.id} className="cursor-pointer">
                    <TableCell className="font-medium">
                      <Link href={`/leads/${l.id}`} className="block">
                        {l.organization?.name ?? "—"}
                        {l.organization?.domain && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {l.organization.domain}
                          </span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/leads/${l.id}`} className="block">
                        {l.contact?.full_name ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <SourceBadge source={l.source} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {l.service_interest
                        ? SERVICE_TYPE_LABELS[l.service_interest]
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <LeadStatusBadge status={l.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {l.owner?.full_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(l.created_at)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  )
}
