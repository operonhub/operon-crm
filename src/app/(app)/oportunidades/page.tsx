import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { KanbanBoard, type OppCard } from "@/components/opportunities/kanban-board"
import { NewOpportunityDialog } from "@/components/opportunities/new-opportunity-dialog"
import { ACTIVE_STAGES } from "@/lib/constants"
import { formatMoney } from "@/lib/format"

export default async function PipelinePage() {
  const supabase = await createClient()

  const [{ data }, { data: profiles }] = await Promise.all([
    supabase
      .from("opportunities")
      .select(
        `id, title, stage, estimated_value, currency, next_action, next_action_date,
         organization:organizations(name),
         owner:profiles!opportunities_owner_id_fkey(full_name)`
      )
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name").order("full_name"),
  ])

  const opportunities = (data ?? []) as OppCard[]

  const activeValue = opportunities
    .filter((o) => ACTIVE_STAGES.includes(o.stage))
    .reduce((s, o) => s + (o.estimated_value ?? 0), 0)

  return (
    <>
      <PageHeader
        title="Pipeline"
        description={`${opportunities.length} oportunidad(es) · ${formatMoney(
          activeValue
        )} activo`}
      >
        <NewOpportunityDialog profiles={profiles ?? []} />
      </PageHeader>
      <div className="p-6">
        <KanbanBoard opportunities={opportunities} />
      </div>
    </>
  )
}
