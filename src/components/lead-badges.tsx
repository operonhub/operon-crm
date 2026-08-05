import { Badge } from "@/components/ui/badge"
import { LEAD_SOURCE_LABELS, LEAD_STATUS_LABELS } from "@/lib/constants"
import type { Enums } from "@/lib/supabase/types"
import { cn } from "@/lib/utils"

export function SourceBadge({ source }: { source: Enums<"lead_source"> }) {
  return <Badge variant="secondary">{LEAD_SOURCE_LABELS[source]}</Badge>
}

const STATUS_STYLES: Record<Enums<"lead_status">, string> = {
  nuevo: "bg-blue-100 text-blue-700 border-blue-200",
  calificado: "bg-green-100 text-green-700 border-green-200",
  descartado: "bg-gray-100 text-gray-500 border-gray-200",
  convertido: "bg-violet-100 text-violet-700 border-violet-200",
}

export function LeadStatusBadge({ status }: { status: Enums<"lead_status"> }) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium dark:bg-transparent", STATUS_STYLES[status])}
    >
      {LEAD_STATUS_LABELS[status]}
    </Badge>
  )
}
