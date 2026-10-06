export type ReservasAgentResult = {
  intent: "interested" | "question" | "objection" | "meeting" | "unsubscribe" | "unknown"
  action: "draft_message" | "follow_up" | "request_human" | "no_action" | "book_meeting"
  reason: string
  confidence: number
  draft: string
  meeting?: { start: string; end: string; evidence_message_id: string }
}
export type ReservasAgentPanel = {
  pending: number
  runs: { id: string; prospect_id: string; name: string; status: string; approval: string;
    result: ReservasAgentResult | null; error_code: string | null; approved_message: string | null; created_at: string;
    appointment_id: string | null; delivery_state: "none" | "transferring" | "queued" | "sent" | "blocked" }[]
}
export const AGENT_ACTION_LABELS = { draft_message: "Preparar mensaje", follow_up: "Proponer seguimiento",
  request_human: "Consultar al equipo", no_action: "Esperar", book_meeting: "Agendar reunión en el CRM" }
