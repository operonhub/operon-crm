import { Badge } from "@/components/ui/badge"
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge"
import { PROJECT_STATUS_LABELS, SERVICE_TYPE_LABELS } from "@/lib/constants"
import type { Enums } from "@/lib/supabase/types"

const STATUS_TONE: Record<Enums<"project_status">, StatusTone> = {
  discovery: "neutral",
  en_progreso: "primary",
  revision: "warning",
  entregado: "success",
  activo: "success",
  pausado: "neutral",
  cerrado: "deep",
}

export function ProjectStatusBadge({ status }: { status: Enums<"project_status"> }) {
  return <StatusBadge tone={STATUS_TONE[status]}>{PROJECT_STATUS_LABELS[status]}</StatusBadge>
}

export function ServiceTypeBadge({ type }: { type: Enums<"service_type"> }) {
  return <Badge variant="secondary">{SERVICE_TYPE_LABELS[type]}</Badge>
}
