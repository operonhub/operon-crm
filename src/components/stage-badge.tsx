import { Badge } from "@/components/ui/badge"
import { STAGE_LABELS } from "@/lib/constants"
import type { Enums } from "@/lib/supabase/types"
import { cn } from "@/lib/utils"

const STAGE_STYLES: Record<Enums<"opportunity_stage">, string> = {
  nuevo:
    "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-800",
  por_investigar:
    "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-800",
  contactado:
    "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
  respondio:
    "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800",
  reunion_agendada:
    "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
  diagnostico_propuesta:
    "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  negociacion:
    "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800",
  ganado:
    "bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800",
  perdido:
    "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
  no_califica:
    "bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-900/40 dark:text-gray-400 dark:border-gray-800",
}

export function StageBadge({ stage }: { stage: Enums<"opportunity_stage"> }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-mono text-[10px] font-medium tracking-wide uppercase",
        STAGE_STYLES[stage]
      )}
    >
      {STAGE_LABELS[stage]}
    </Badge>
  )
}
