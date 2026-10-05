import Link from "next/link"
import { redirect } from "next/navigation"
import { Building2, CalendarClock, Download, MessageCircle, Clock3, ShieldOff, ExternalLink } from "lucide-react"
import { AuthorizationError, requireMember } from "@/lib/auth"
import { conversion, reservasFunnel, reservasTimestamp, RESERVAS_STAGES, type ReservasPanel } from "@/lib/reservas-sales"
import { loadReservasPanel } from "@/lib/reservas-sales-server"
import { formatDateNumeric } from "@/lib/format"
import { PageHeader } from "@/components/page-header"
import { PageTransition } from "@/components/shell/page-transition"
import { EmptyState } from "@/components/shell/empty-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { MilestoneDialog } from "@/components/reservas/milestone-dialog"

type Params = { page?: string; q?: string; stage?: string; attention?: string }

export default async function ReservasSalesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  let member
  try { member = await requireMember() } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401) redirect("/login")
    return <div className="p-6"><EmptyState title="Acceso restringido" description="Esta sección requiere una cuenta del equipo de Operon." /></div>
  }
  const parsedPage = Number(params.page ?? 1)
  const page = Number.isInteger(parsedPage) && parsedPage > 0 && parsedPage <= 100000 ? parsedPage : 1
  const search = (params.q ?? "").slice(0, 150)
  const stage = Object.hasOwn(RESERVAS_STAGES, params.stage ?? "") ? params.stage! : ""
  const attention = ["pending", "overdue", "meeting", "suppressed"].includes(params.attention ?? "") ? params.attention! : ""
  let panel: ReservasPanel
  try { panel = await loadReservasPanel(member.supabase, { page, search, stage, attention }) } catch {
    return <><PageHeader title="Prospección de alojamientos" eyebrow="Operon Reservas" />
      <div className="p-6"><EmptyState title="No pudimos cargar la prospección" description="Los datos no están disponibles. Volvé a intentar; no se muestran métricas parciales."
        action={<Button nativeButton={false} render={<Link href="/reservas-prospectos" />}>Volver a intentar</Button>} /></div></>
  }
  const href = (overrides: Partial<Params>) => {
    const query = new URLSearchParams()
    Object.entries({ q: search, stage, attention, ...overrides }).forEach(([key, value]) => { if (value) query.set(key, value) })
    return `/reservas-prospectos?${query}`
  }
  const metrics = panel.metrics
  const totalPages = Math.max(1, Math.ceil(panel.filtered_count / panel.page_size))
  return <PageTransition>
    <PageHeader title="Prospección de alojamientos" eyebrow="Operon Reservas"
      description="Del primer contacto a la reunión. Sólo prospectos de este piloto · horario de Argentina.">
      <Button variant="outline" nativeButton={false} render={<a href="/api/reservas-prospectos/export?format=json" />}><Download /> JSON completo</Button>
      <details className="relative">
        <summary className="cursor-pointer rounded-lg border bg-background px-3 py-1.5 text-sm font-medium">CSV para Excel</summary>
        <div className="absolute right-0 z-20 mt-2 w-52 rounded-lg border bg-popover p-1 shadow-md">
          {["prospectos", "eventos", "mensajes"].map(dataset => <a key={dataset} href={`/api/reservas-prospectos/export?format=csv&dataset=${dataset}`} className="block rounded px-3 py-2 text-sm capitalize hover:bg-muted">{dataset}</a>)}
        </div>
      </details>
    </PageHeader>
    <div className="space-y-6 p-4 sm:p-6">
      {metrics.imported === 0 ? <EmptyState icon={<Building2 />} title="Todavía no hay alojamientos en este piloto"
        description="Cuando la importación de Sheets registre los prospectos en el CRM, vas a ver sus chats e hitos comerciales acá." /> : <>
        <section aria-labelledby="reservas-funnel" className="rounded-xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
            <div><h2 id="reservas-funnel" className="font-heading font-semibold">Recorrido comercial</h2>
              <p className="text-xs text-muted-foreground">Acumulado de todo el piloto. Los filtros de abajo sólo cambian la tabla.</p></div>
            <span className="text-xs text-muted-foreground">Actualizado {reservasTimestamp(panel.generated_at)}</span>
          </div>
          <ol className="flex snap-x overflow-x-auto divide-x">
            {reservasFunnel(metrics).map((step, index) => {
              const rate = step.numerator === null || step.denominator === null ? null : conversion(step.numerator, step.denominator)
              return <li key={step.label} className="min-w-40 flex-1 snap-start p-4">
                <p className="label-mono text-muted-foreground">{String(index + 1).padStart(2, "0")} · {step.label}</p>
                <p className="mt-2 font-heading text-3xl font-semibold tabular-nums">{step.count}</p>
                <p className="mt-3 text-sm font-medium">{rate === null ? "—" : `${rate.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`}</p>
                <p className="text-xs text-muted-foreground">{step.denominator === null ? step.base : `${step.numerator} de ${step.denominator} ${step.base}`}</p>
              </li>
            })}
          </ol>
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">Cada alojamiento cuenta una vez por hito. Las tasas incluyen a quienes tienen ambos hitos; no se infieren etapas omitidas. Ganados y perdidos reflejan el último estado registrado.</p>
        </section>
        <section aria-label="Atención comercial" className="flex flex-wrap gap-x-6 gap-y-3 rounded-lg border-l-4 border-primary bg-muted/40 px-4 py-3">
          {[
            { key: "pending", count: metrics.pending, label: "respuestas pendientes", icon: MessageCircle },
            { key: "overdue", count: metrics.overdue, label: "seguimientos vencidos", icon: Clock3 },
            { key: "meeting", count: metrics.meeting_soon, label: "reuniones en 48 h", icon: CalendarClock },
            { key: "suppressed", count: metrics.suppressed, label: "no contactar", icon: ShieldOff },
          ].map(item => <Link key={item.key} href={href({ attention: item.key, page: "1" })} className="inline-flex items-center gap-2 text-sm hover:underline"><item.icon className="size-4 text-muted-foreground" /><strong className="tabular-nums">{item.count}</strong> {item.label}</Link>)}
          <span className="text-sm text-muted-foreground">{metrics.lost} perdidos</span>
        </section>
        <section aria-labelledby="reservas-table" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2"><h2 id="reservas-table" className="font-heading font-semibold">Alojamientos · {panel.filtered_count}</h2>
            <p className="text-xs text-muted-foreground">Sin un mensaje o hito registrado, no se afirma contacto ni avance.</p></div>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="min-w-44 flex-1 space-y-1"><label htmlFor="reservas-search" className="text-xs font-medium">Alojamiento o teléfono</label><Input id="reservas-search" name="q" defaultValue={search} placeholder="Buscar" maxLength={150} /></div>
            <div className="space-y-1"><label htmlFor="reservas-stage" className="text-xs font-medium">Estado</label><select id="reservas-stage" name="stage" defaultValue={stage} className="block h-8 max-w-full rounded-md border bg-background px-2 text-sm"><option value="">Todos los estados</option>{Object.entries(RESERVAS_STAGES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div className="space-y-1"><label htmlFor="reservas-attention" className="text-xs font-medium">Atención</label><select id="reservas-attention" name="attention" defaultValue={attention} className="block h-8 rounded-md border bg-background px-2 text-sm"><option value="">Todos</option><option value="pending">Respuesta pendiente</option><option value="overdue">Seguimiento vencido</option><option value="meeting">Reunión en 48 h</option><option value="suppressed">No contactar</option></select></div>
            <Button type="submit" variant="outline">Filtrar</Button>
            {(search || stage || attention) && <Link href="/reservas-prospectos" className="py-1 text-sm text-muted-foreground underline">Limpiar</Link>}
          </form>
          <p className="text-xs text-muted-foreground sm:hidden">Deslizá la tabla para ver próximos pasos y acciones.</p>
          <div className="rounded-lg border bg-card">
            <Table><TableHeader><TableRow><TableHead>Alojamiento</TableHead><TableHead>Estado</TableHead><TableHead>Último contacto</TableHead><TableHead>Próximo paso</TableHead><TableHead><span className="sr-only">Acciones</span></TableHead></TableRow></TableHeader>
              <TableBody>{panel.rows.length === 0 ? <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No hay alojamientos con estos filtros.</TableCell></TableRow> : panel.rows.map(row => <TableRow key={row.id}>
                <TableCell className="min-w-48 whitespace-normal"><Link href={`/leads/${row.lead_id}`} className="font-medium hover:underline">{row.organization_name}</Link><p className="text-xs text-muted-foreground">{row.phone_e164} · {row.owner_name ?? "Sin responsable"}</p><a href={row.sheet_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">Fila de origen <ExternalLink className="size-3" /></a></TableCell>
                <TableCell><Badge variant={row.stage === "won" ? "default" : "secondary"}>{RESERVAS_STAGES[row.stage]}</Badge>{row.do_not_contact && <p className="mt-1 text-xs font-medium text-destructive" title={row.suppression_reason ?? ""}>No contactar</p>}</TableCell>
                <TableCell className="min-w-40 text-xs whitespace-normal">{row.last_contact_at ? reservasTimestamp(row.last_contact_at) : "Sin contacto registrado"}{row.pending_response && <p className="mt-1 font-medium text-primary">Esperando respuesta del equipo</p>}</TableCell>
                <TableCell className="min-w-48 max-w-72 text-xs whitespace-normal">{row.do_not_contact ? "Contacto bloqueado" : ["won", "lost"].includes(row.stage) ? "Ciclo cerrado" : <>
                  {row.next_action ? <><p className="font-medium">{row.next_action}</p><p className={row.follow_up_overdue ? "text-destructive" : "text-muted-foreground"}>{formatDateNumeric(row.next_action_date)}{row.follow_up_overdue ? " · vencido" : ""}</p></> : !row.meeting_at && <p className="text-muted-foreground">Sin próximo paso definido</p>}
                  {row.meeting_at && <p className="mt-1">Reunión: {reservasTimestamp(row.meeting_at)}{Date.parse(row.meeting_at) < Date.parse(panel.generated_at) ? " · falta registrar resultado" : ""}</p>}
                  <Link href={`/leads/${row.lead_id}`} className="mt-1 inline-block text-muted-foreground underline">Gestionar seguimiento</Link>
                </>}</TableCell>
                <TableCell><div className="flex flex-col items-start gap-2">{row.conversation_id ? <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/bandeja?tab=chats&canal=whatsapp&conversation=${row.conversation_id}`} />}><MessageCircle /> Abrir chat</Button> : <span className="text-xs text-muted-foreground">Chat sin vincular</span>}<MilestoneDialog prospectId={row.id} name={row.organization_name} /></div></TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-muted-foreground">Página {page} de {totalPages} · Las exportaciones incluyen todo el piloto.</p><div className="flex gap-3">{page > 1 && <Link href={href({ page: String(page - 1) })} className="underline">Anterior</Link>}{page < totalPages && <Link href={href({ page: String(page + 1) })} className="underline">Siguiente</Link>}</div></div>
        </section>
      </>}
    </div>
  </PageTransition>
}
