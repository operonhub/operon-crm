import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { KanbanBoard, type OppCard } from "@/components/opportunities/kanban-board"
import { NewOpportunityDialog } from "@/components/opportunities/new-opportunity-dialog"
import { PipelineTabs } from "@/components/pipeline/pipeline-tabs"

export default async function PipelinePage() {
  const supabase = await createClient()

  const [{ data }, { data: profiles }, { data: activities }] = await Promise.all([
    supabase
      .from("opportunities")
      .select(
        `id, title, stage, service_type, estimated_value, currency, next_action, next_action_date, updated_at,
         organization:organizations(name),
         owner:profiles!opportunities_owner_id_fkey(full_name)`
      )
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name").order("full_name"),
    /*
     * Se traen las actividades y se reducen acá en vez de pedirle a Postgres
     * un `max(created_at) group by opportunity_id`: PostgREST no expone
     * agregados sin crear una vista, y agregar una migración por un dato
     * derivado que cabe en memoria es un costo mayor que el que ahorra.
     * Si el volumen crece, esta es la primera consulta a mover a una vista.
     */
    supabase
      .from("activities")
      .select("opportunity_id, created_at")
      .not("opportunity_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(2000),
  ])

  const ultimaActividad = new Map<string, string>()
  for (const activity of activities ?? []) {
    // Vienen ordenadas de más nueva a más vieja: la primera de cada
    // oportunidad ya es la última actividad, no hace falta comparar.
    if (activity.opportunity_id && !ultimaActividad.has(activity.opportunity_id)) {
      ultimaActividad.set(activity.opportunity_id, activity.created_at)
    }
  }

  /**
   * "Movimiento" es la actividad más reciente **o** la última edición de la
   * oportunidad, lo que sea posterior.
   *
   * Se eligió así y no sólo la tabla `activities` porque con pocas actividades
   * registradas todas las fichas dirían lo mismo y el dato no serviría para
   * decidir nada. Mover de etapa o editar el monto también es empujar el
   * trato, y `updated_at` siempre existe.
   */
  const opportunities: OppCard[] = ((data ?? []) as RawOpportunity[]).map(
    (opportunity) => {
      const actividad = ultimaActividad.get(opportunity.id)
      return {
        ...opportunity,
        last_movement_at:
          actividad && actividad > opportunity.updated_at
            ? actividad
            : opportunity.updated_at,
      }
    }
  )

  return (
    <>
      <PageHeader
        title="Pipeline"
        description="El ancho de cada etapa muestra cuántas oportunidades tiene. Arrastrá una ficha para avanzarla."
      >
        <PipelineTabs />
        <NewOpportunityDialog profiles={profiles ?? []} />
      </PageHeader>
      <div className="p-4 sm:p-6">
        <KanbanBoard opportunities={opportunities} />
      </div>
    </>
  )
}

type RawOpportunity = Omit<OppCard, "last_movement_at">
