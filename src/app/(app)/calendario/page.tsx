import Link from "next/link"
import { redirect } from "next/navigation"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { AuthorizationError, requireMember } from "@/lib/auth"
import { argentinaDay, APPOINTMENT_LABELS, type CrmCalendar } from "@/lib/crm-calendar"
import { reservasTimestamp } from "@/lib/reservas-sales"
import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/shell/empty-state"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { NewMeeting, MeetingStatusControls } from "@/components/reservas/calendar-controls"

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; day?: string }> }) {
  let member
  try { member = await requireMember() } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401) redirect("/login")
    return <EmptyState title="Acceso restringido" description="El calendario es para el equipo de Operon." />
  }
  const params = await searchParams
  const today = argentinaDay(new Date().toISOString())
  const month = /^20\d{2}-(0[1-9]|1[0-2])$/.test(params.month ?? "") ? params.month! : today.slice(0, 7)
  const [year, number] = month.split("-").map(Number)
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate()
  const selected = /^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(params.day ?? "") && params.day!.startsWith(month) && Number(params.day!.slice(-2)) >= 1 && Number(params.day!.slice(-2)) <= days ? params.day! : today.startsWith(month) ? today : `${month}-01`
  const first = new Date(Date.UTC(year, number - 1, 1))
  const offset = (first.getUTCDay() + 6) % 7
  const next = new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 7)
  const prev = new Date(Date.UTC(year, number - 2, 1)).toISOString().slice(0, 7)
  const { data, error } = await member.supabase.rpc("get_crm_calendar", { p_from: `${month}-01T00:00:00-03:00`, p_to: `${next}-01T00:00:00-03:00` })
  if (error || !data) return <div className="p-6"><EmptyState title="No pudimos cargar el calendario" description="Volvé a intentar. No se muestran datos incompletos." /></div>
  const calendar = data as unknown as CrmCalendar
  const appointments = calendar.appointments.filter(a => argentinaDay(a.starts_at) === selected)
  const monthLabel = first.toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" })
  return <>
    <PageHeader title="Calendario del equipo" eyebrow="Operon" description="Agenda compartida · reuniones de 15 a 20 minutos · horario de Argentina."><NewMeeting day={selected} team={calendar.team} /></PageHeader>
    <div className="grid gap-6 p-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] sm:p-6">
      <section aria-label="Calendario mensual" className="self-start overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b p-4"><h2 className="font-heading text-lg font-semibold capitalize">{monthLabel}</h2><div className="flex items-center gap-2">
          <Button size="icon-sm" variant="ghost" nativeButton={false} render={<Link href={`/calendario?month=${prev}`} aria-label="Mes anterior" />}><ChevronLeft /></Button>
          <Link href="/calendario" className="text-sm underline">Hoy</Link>
          <Button size="icon-sm" variant="ghost" nativeButton={false} render={<Link href={`/calendario?month=${next}`} aria-label="Mes siguiente" />}><ChevronRight /></Button></div></div>
        <div className="grid grid-cols-7 text-center">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(d => <span key={d} className="border-b bg-muted/30 py-2 text-xs text-muted-foreground">{d}</span>)}
          {Array.from({ length: offset }, (_, i) => <div key={`empty-${i}`} className="min-h-16 border-b" />)}
          {Array.from({ length: days }, (_, i) => {
            const day = `${month}-${String(i + 1).padStart(2, "0")}`
            const count = calendar.appointments.filter(a => a.status === "scheduled" && argentinaDay(a.starts_at) === day).length
            return <Link href={`/calendario?month=${month}&day=${day}`} key={day} aria-current={day === selected ? "date" : undefined}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 border-b border-r p-1 text-sm hover:bg-muted ${day === selected ? "bg-primary/10 font-semibold ring-1 ring-inset ring-primary" : ""}`}>
              <span className={day === today ? "flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground" : ""}>{i + 1}</span>
              {count > 0 && <span className="text-[10px] text-muted-foreground">{count} reunión{count > 1 ? "es" : ""}</span>}</Link>
          })}</div>
        <p className="p-4 text-xs text-muted-foreground">Sin horarios de atención fijos. Coordiná la fecha con el cliente; la agenda evita superponer reuniones.</p>
      </section>
      <section aria-labelledby="day-agenda"><h2 id="day-agenda" className="mb-4 flex items-center gap-2 font-heading text-lg font-semibold"><CalendarDays className="size-5" />{new Date(`${selected}T12:00:00-03:00`).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" })}</h2>
        {appointments.length === 0 ? <EmptyState title="Día libre" description="No hay reuniones registradas para esta fecha." /> : <div className="space-y-4">
          {appointments.map(a => <article key={a.id} className="rounded-lg border-l-4 border-primary bg-card p-4 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{a.title}</h3><Badge variant="secondary">{APPOINTMENT_LABELS[a.status]}</Badge></div>
            {a.status === "scheduled" && <p className="mt-1 text-xs font-medium">{a.confirmation === "confirmed" ? "Confirmada por el cliente" : "Pendiente de confirmar"}</p>}
            <p className="mt-2 text-sm">{reservasTimestamp(a.starts_at)} · {Math.round((Date.parse(a.ends_at) - Date.parse(a.starts_at)) / 60000)} minutos</p>
            <p className="mt-1 text-xs text-muted-foreground">Responsable: {a.responsible_name ?? "Sin asignar"}</p>
            {a.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{a.notes}</p>}
            {a.prospect_id && <Link href="/reservas-prospectos" className="mt-2 inline-block text-xs underline">Ver prospección</Link>}
            {a.status === "scheduled" && <MeetingStatusControls id={a.id} confirmation={a.confirmation} responsibleId={a.responsible_id} team={calendar.team} canComplete={Date.parse(a.starts_at) <= Date.parse(calendar.generated_at)} />}
          </article>)}</div>}
      </section>
    </div>
  </>
}
