import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default async function OrganizacionesPage() {
  const supabase = await createClient()

  const { data: orgs } = await supabase
    .from("organizations")
    .select(
      `id, name, domain, industry, city,
       contacts(count), leads(count), opportunities:opportunities(count)`
    )
    .order("name")

  const rows = orgs ?? []

  return (
    <>
      <PageHeader
        title="Organizaciones"
        description={`${rows.length} empresa(s)`}
      />
      <div className="p-6">
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Industria</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead className="text-center">Contactos</TableHead>
                <TableHead className="text-center">Leads</TableHead>
                <TableHead className="text-center">Oportunidades</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Todavía no hay organizaciones.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">
                      <Link href={`/organizaciones/${o.id}`} className="block">
                        {o.name}
                        {o.domain && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {o.domain}
                          </span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {o.industry ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {o.city ?? "—"}
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {o.contacts?.[0]?.count ?? 0}
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {o.leads?.[0]?.count ?? 0}
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {o.opportunities?.[0]?.count ?? 0}
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
