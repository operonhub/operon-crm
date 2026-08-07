import { Badge } from "@/components/ui/badge"
import { LEAD_SOURCE_LABELS, LEAD_STATUS_LABELS } from "@/lib/constants"
import type { Enums } from "@/lib/supabase/types"
import { cn } from "@/lib/utils"

export function SourceBadge({ source }: { source: Enums<"lead_source"> }) {
  return <Badge variant="secondary">{LEAD_SOURCE_LABELS[source]}</Badge>
}

const STATUS_STYLES: Record<Enums<"lead_status">, string> = {
  nuevo:
    "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
  calificado:
    "bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800",
  descartado:
    "bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-900/40 dark:text-gray-400 dark:border-gray-800",
  convertido:
    "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
}

export function LeadStatusBadge({ status }: { status: Enums<"lead_status"> }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-mono text-[10px] font-medium tracking-wide uppercase",
        STATUS_STYLES[status]
      )}
    >
      {LEAD_STATUS_LABELS[status]}
    </Badge>
  )
}
