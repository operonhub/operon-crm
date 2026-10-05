import { TIMEZONE } from "./format"

export const RESERVAS_STAGES = {
  new: "Sin contacto registrado", contacted: "Contactado", responded: "Respondió",
  meeting_scheduled: "Reunión agendada", meeting_held: "Reunión realizada",
  meeting_cancelled: "Reunión cancelada", proposal_sent: "Propuesta enviada",
  won: "Ganado", lost: "Perdido",
} as const
export type ReservasStage = keyof typeof RESERVAS_STAGES

export type ReservasSalesRow = {
  id: string; lead_id: string; sheet_id: string; sheet_lead_id: string; sheet_url: string
  phone_e164: string; organization_name: string; owner_name: string | null
  do_not_contact: boolean; suppression_reason: string | null; created_at: string
  conversation_id: string | null; stage: ReservasStage
  first_outbound_at: string | null; last_outbound_at: string | null; last_inbound_at: string | null
  last_contact_at: string | null; responded: boolean; meeting_scheduled: boolean; meeting_held: boolean
  proposal_sent: boolean; ever_won: boolean; ever_lost: boolean
  scheduled_at: string | null; held_at: string | null; proposal_at: string | null
  won_at: string | null; lost_at: string | null; meeting_at: string | null
  next_action: string | null; next_action_date: string | null
  pending_response: boolean; follow_up_overdue: boolean; meeting_soon: boolean
}
export type ReservasMetrics = {
  imported: number; contacted: number; responded: number; scheduled: number; held: number
  proposed: number; won: number; lost: number; suppressed: number
  scheduled_from_replies: number; held_from_scheduled: number; proposed_from_held: number
  won_from_proposed: number; pending: number; overdue: number; meeting_soon: number
}
export type ReservasPanel = {
  rows: ReservasSalesRow[]; metrics: ReservasMetrics; generated_at: string
  page: number; page_size: number; filtered_count: number
}
export type ReservasEvent = {
  id: string; prospect_id: string; source: string; source_event_id: string; event_type: string
  actor: string; occurred_at: string; recorded_at: string; details: Record<string, unknown>
}
export type ReservasMessage = {
  id: string; conversation_id: string; zernio_conversation_id: string; zernio_message_id: string | null
  direction: string; body: string | null; attachments: unknown; sent_at: string
  sent_by: string | null; delivery_status: string; deleted_at: string | null
}
export type ReservasExportRow = ReservasSalesRow & { events: ReservasEvent[]; messages: ReservasMessage[] }
export type ExportDataset = "prospectos" | "eventos" | "mensajes"

export function conversion(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator * 100 : null
}
export function reservasFunnel(metrics: ReservasMetrics) {
  return [
    { label: "Importados", count: metrics.imported, numerator: null, denominator: null, base: "Prospectos del piloto" },
    { label: "Contactados", count: metrics.contacted, numerator: metrics.contacted, denominator: metrics.imported, base: "sobre importados" },
    { label: "Respondieron", count: metrics.responded, numerator: metrics.responded, denominator: metrics.contacted, base: "sobre contactados" },
    { label: "Agendaron", count: metrics.scheduled, numerator: metrics.scheduled_from_replies, denominator: metrics.responded, base: "sobre quienes respondieron" },
    { label: "Reunión realizada", count: metrics.held, numerator: metrics.held_from_scheduled, denominator: metrics.scheduled, base: "sobre quienes agendaron" },
    { label: "Propuesta", count: metrics.proposed, numerator: metrics.proposed_from_held, denominator: metrics.held, base: "sobre reuniones realizadas" },
    { label: "Ganados", count: metrics.won, numerator: metrics.won_from_proposed, denominator: metrics.proposed, base: "sobre propuestas enviadas" },
  ]
}

const TIMESTAMP_FORMAT = new Intl.DateTimeFormat("es-AR", {
  timeZone: TIMEZONE, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  hourCycle: "h23",
})
export function argentineInputTimestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const date = new Date(`${value}:00-03:00`)
  if (!Number.isFinite(date.getTime()) || new Date(date.getTime() - 3 * 3600_000).toISOString().slice(0, 16) !== value) return null
  return date.toISOString()
}
export function reservasTimestamp(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Sin fecha confirmada"
  return TIMESTAMP_FORMAT.format(new Date(value))
}

/** Quote every cell and neutralize spreadsheet formulas, including phone + prefixes. */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value)
  if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}
function utc(value: string | null) {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : ""
}
export function reservasCsv(rows: ReservasExportRow[], dataset: ExportDataset) {
  let header: string[]
  let records: unknown[][]
  if (dataset === "eventos") {
    header = ["prospect_id", "lead_id", "evento_id", "fuente", "id_evento_fuente", "tipo", "actor", "ocurrido_en_UTC", "registrado_en_UTC", "detalles_JSON"]
    records = rows.flatMap(r => r.events.map(e => [r.id, r.lead_id, e.id, e.source, e.source_event_id, e.event_type, e.actor, utc(e.occurred_at), utc(e.recorded_at), JSON.stringify(e.details)]))
  } else if (dataset === "mensajes") {
    header = ["prospect_id", "lead_id", "mensaje_id", "conversacion_CRM", "conversacion_Zernio", "mensaje_Zernio", "direccion", "texto", "adjuntos_JSON", "enviado_en_UTC", "autor_CRM", "estado_entrega", "eliminado_en_UTC"]
    records = rows.flatMap(r => r.messages.map(m => [r.id, r.lead_id, m.id, m.conversation_id, m.zernio_conversation_id, m.zernio_message_id, m.direction, m.body, JSON.stringify(m.attachments), utc(m.sent_at), m.sent_by, m.delivery_status, utc(m.deleted_at)]))
  } else {
    header = ["prospect_id", "lead_id", "alojamiento", "telefono_texto", "sheet_id", "sheet_lead_id", "hoja_URL", "responsable", "estado", "no_contactar", "motivo_supresion", "conversacion_CRM", "primer_saliente_UTC", "ultimo_saliente_UTC", "ultimo_entrante_UTC", "ultimo_contacto_UTC", "agendado_en_UTC", "realizada_en_UTC", "propuesta_en_UTC", "ganado_en_UTC", "perdido_en_UTC", "reunion_confirmada_UTC", "proximo_paso", "fecha_proximo_paso_Argentina", "respuesta_pendiente", "seguimiento_vencido"]
    records = rows.map(r => [r.id, r.lead_id, r.organization_name, r.phone_e164, r.sheet_id, r.sheet_lead_id, r.sheet_url, r.owner_name, RESERVAS_STAGES[r.stage], r.do_not_contact, r.suppression_reason, r.conversation_id, utc(r.first_outbound_at), utc(r.last_outbound_at), utc(r.last_inbound_at), utc(r.last_contact_at), utc(r.scheduled_at), utc(r.held_at), utc(r.proposal_at), utc(r.won_at), utc(r.lost_at), utc(r.meeting_at), r.next_action, r.next_action_date, r.pending_response, r.follow_up_overdue])
  }
  return "\uFEFFsep=;\r\n" + [header, ...records].map(record => record.map(csvCell).join(";")).join("\r\n") + "\r\n"
}
