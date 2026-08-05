import { Badge } from "@/components/ui/badge"
import { STAGE_LABELS } from "@/lib/constants"
import type { Enums } from "@/lib/supabase/types"
import { cn } from "@/lib/utils"

const STAGE_STYLES: Record<Enums<"opportunity_stage">, string> = {
  nuevo: "bg-slate-100 text-slate-700 border-slate-200",
  por_investigar: "bg-slate-100 text-slate-700 border-slate-200",
  contactado: "bg-blue-100 text-blue-700 border-blue-200",
  respondio: "bg-indigo-100 text-indigo-700 border-indigo-200",
  reunion_agendada: "bg-violet-100 text-violet-700 border-violet-200",
  diagnostico_propuesta: "bg-amber-100 text-amber-700 border-amber-200",
  negociacion: "bg-orange-100 text-orange-700 border-orange-200",
  ganado: "bg-green-100 text-green-700 border-green-200",
  perdido: "bg-red-100 text-red-700 border-red-200",
  no_califica: "bg-gray-100 text-gray-500 border-gray-200",
}

export function StageBadge({ stage }: { stage: Enums<"opportunity_stage"> }) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium dark:bg-transparent", STAGE_STYLES[stage])}
    >
      {STAGE_LABELS[stage]}
    </Badge>
  )
}
