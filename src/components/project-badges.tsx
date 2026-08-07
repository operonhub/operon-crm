import { Badge } from "@/components/ui/badge"
import { PROJECT_STATUS_LABELS, SERVICE_TYPE_LABELS } from "@/lib/constants"
import type { Enums } from "@/lib/supabase/types"
import { cn } from "@/lib/utils"

const STATUS_STYLES: Record<Enums<"project_status">, string> = {
  discovery:
    "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-800",
  en_progreso:
    "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
  revision:
    "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  entregado:
    "bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800",
  activo:
    "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  pausado:
    "bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-900/40 dark:text-gray-400 dark:border-gray-800",
  cerrado:
    "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
}

export function ProjectStatusBadge({
  status,
}: {
  status: Enums<"project_status">
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-mono text-[10px] font-medium tracking-wide uppercase",
        STATUS_STYLES[status]
      )}
    >
      {PROJECT_STATUS_LABELS[status]}
    </Badge>
  )
}

export function ServiceTypeBadge({ type }: { type: Enums<"service_type"> }) {
  return <Badge variant="secondary">{SERVICE_TYPE_LABELS[type]}</Badge>
}
