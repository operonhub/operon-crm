import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { KanbanBoard, type OppCard } from "@/components/opportunities/kanban-board"
import { ACTIVE_STAGES } from "@/lib/constants"
import { formatMoney } from "@/lib/format"
import { PipelineTabs } from "@/components/pipeline/pipeline-tabs"

export default async function PipelinePage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from("opportunities")
    .select(
      `id, title, stage, service_type, estimated_value, currency, next_action, next_action_date,
       organization:organizations(name),
       owner:profiles!opportunities_owner_id_fkey(full_name)`
    )
    .order("created_at", { ascending: false })

  const opportunities = (data ?? []) as OppCard[]

  const activeTotals = opportunities
    .filter((o) => ACTIVE_STAGES.includes(o.stage))
    .reduce<Record<string, number>>((totals, opportunity) => {
      totals[opportunity.currency] =
        (totals[opportunity.currency] ?? 0) + (opportunity.estimated_value ?? 0)
      return totals
    }, {})
  const activeValueLabel = Object.entries(activeTotals)
    .filter(([, total]) => total > 0)
    .map(([currency, total]) => formatMoney(total, currency))
    .join(" · ")

  return (
    <>
      <PageHeader
        title="Pipeline"
        description={`${opportunities.length} oportunidad${opportunities.length === 1 ? "" : "es"}${activeValueLabel ? ` · ${activeValueLabel} activo` : ""}`}
      >
        <PipelineTabs />
      </PageHeader>
      <div className="p-4 sm:p-6">
        <KanbanBoard opportunities={opportunities} />
      </div>
    </>
  )
}
