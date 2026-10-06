export type CrmAppointment = { id: string; title: string; starts_at: string; ends_at: string;
  status: "scheduled" | "held" | "cancelled"; confirmation: "pending" | "confirmed"; prospect_id: string | null; responsible_id: string | null;
  responsible_name: string | null; notes: string }
export type CrmCalendar = { timezone: string; from: string; to: string; generated_at: string;
  appointments: CrmAppointment[]; config: { duration_minutes: number }; team: { id: string; name: string }[] }
export const APPOINTMENT_LABELS = { scheduled: "Agendada", held: "Realizada", cancelled: "Cancelada" }
export function argentinaDay(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso))
}
