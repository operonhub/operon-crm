import { Badge } from "@/components/ui/badge"
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge"
import { LEAD_SOURCE_LABELS, LEAD_STATUS_LABELS } from "@/lib/constants"
import type { Enums } from "@/lib/supabase/types"

export function SourceBadge({ source }: { source: Enums<"lead_source"> }) {
  return <Badge variant="secondary">{LEAD_SOURCE_LABELS[source]}</Badge>
}

const STATUS_TONE: Record<Enums<"lead_status">, StatusTone> = {
  nuevo: "info",
  calificado: "success",
  descartado: "neutral",
  convertido: "deep",
}

export function LeadStatusBadge({ status }: { status: Enums<"lead_status"> }) {
  return <StatusBadge tone={STATUS_TONE[status]}>{LEAD_STATUS_LABELS[status]}</StatusBadge>
}
