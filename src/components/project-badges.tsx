import { Badge } from "@/components/ui/badge"
import { PROJECT_STATUS_LABELS, SERVICE_TYPE_LABELS } from "@/lib/constants"
import type { Enums } from "@/lib/supabase/types"
import { cn } from "@/lib/utils"

const STATUS_STYLES: Record<Enums<"project_status">, string> = {
  discovery: "bg-slate-100 text-slate-700 border-slate-200",
  en_progreso: "bg-blue-100 text-blue-700 border-blue-200",
  revision: "bg-amber-100 text-amber-700 border-amber-200",
  entregado: "bg-green-100 text-green-700 border-green-200",
  activo: "bg-emerald-100 text-emerald-700 border-emerald-200",
  pausado: "bg-gray-100 text-gray-500 border-gray-200",
  cerrado: "bg-violet-100 text-violet-700 border-violet-200",
}

export function ProjectStatusBadge({
  status,
}: {
  status: Enums<"project_status">
}) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium dark:bg-transparent", STATUS_STYLES[status])}
    >
      {PROJECT_STATUS_LABELS[status]}
    </Badge>
  )
}

export function ServiceTypeBadge({ type }: { type: Enums<"service_type"> }) {
  return <Badge variant="secondary">{SERVICE_TYPE_LABELS[type]}</Badge>
}
