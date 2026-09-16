import { StatusBadge, type StatusTone } from "@/components/ui/status-badge"
import { STAGE_LABELS } from "@/lib/constants"
import type { Enums } from "@/lib/supabase/types"

/**
 * El tono sigue el avance del trato: gris mientras no hay respuesta, azul a
 * medida que se calienta, sol cuando hay plata sobre la mesa, y verde o rosa
 * al cerrarse.
 */
const STAGE_TONE: Record<Enums<"opportunity_stage">, StatusTone> = {
  nuevo: "neutral",
  por_investigar: "neutral",
  contactado: "info",
  respondio: "info",
  reunion_agendada: "primary",
  diagnostico_propuesta: "warning",
  negociacion: "warning",
  ganado: "success",
  perdido: "danger",
  no_califica: "neutral",
}

export function StageBadge({ stage }: { stage: Enums<"opportunity_stage"> }) {
  return <StatusBadge tone={STAGE_TONE[stage]}>{STAGE_LABELS[stage]}</StatusBadge>
}
