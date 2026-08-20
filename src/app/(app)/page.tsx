import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import {
  getDashboardData,
  getQuickCreateOptions,
  parseScope,
} from "@/lib/dashboard/queries"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { DashboardSummary } from "@/components/dashboard/dashboard-summary"
import { AttentionRadar } from "@/components/dashboard/attention-radar"
import { ActiveProjects } from "@/components/dashboard/active-projects"
import { DashboardTasks } from "@/components/dashboard/dashboard-tasks"
import { DashboardAgenda } from "@/components/dashboard/dashboard-agenda"
import { ActiveClients } from "@/components/dashboard/active-clients"
import { Section } from "@/components/dashboard/section"

/** Cuánto se muestra en el panel antes de mandar a la sección completa. */
const PROJECTS_LIMIT = 5
const CLIENTS_LIMIT = 5

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>
}) {
  const { scope: scopeParam } = await searchParams
  const scope = parseScope(scopeParam)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle()

  const [data, quickCreateOptions] = await Promise.all([
    getDashboardData(scope, user.id),
    getQuickCreateOptions(),
  ])

  const mine = scope === "mine"
  const scopeSuffix = mine ? "de tu trabajo" : "de todo el equipo"

  return (
    <>
      <DashboardHeader
        fullName={profile?.full_name || user.email || "equipo"}
        scope={scope}
        options={quickCreateOptions}
      />

      {/*
        Un único flujo con `order`: en mobile manda lo urgente (alertas, tareas,
        agenda) y en desktop pasa a dos columnas, con proyectos como bloque
        principal y agenda/clientes en la columna lateral.
      */}
      <div className="flex flex-col gap-6 p-4 sm:p-6 lg:grid lg:grid-cols-3 lg:items-start">
        <div className="order-4 lg:order-1 lg:col-span-3">
          <DashboardSummary summary={data.summary} scopeSuffix={scopeSuffix} />
        </div>

        <div className="order-3 lg:order-4 lg:col-span-3">
          <Section
            id="alertas"
            title="Requieren atención"
            count={data.alerts.length}
          >
            <AttentionRadar alerts={data.alerts} />
          </Section>
        </div>

        <div className="order-5 lg:order-5 lg:col-span-2">
          <Section
            id="proyectos"
            title="Proyectos activos"
            count={data.projects.length}
            moreHref="/proyectos"
          >
            <ActiveProjects
              projects={data.projects.slice(0, PROJECTS_LIMIT)}
              today={data.today}
            />
          </Section>
        </div>

        <div className="order-2 lg:order-3 lg:col-span-1">
          <Section id="agenda" title="Agenda">
            <DashboardAgenda agenda={data.agenda} />
          </Section>
        </div>

        <div className="order-1 lg:order-2 lg:col-span-2">
          <Section
            id="tareas"
            title={mine ? "Mis tareas" : "Tareas del equipo"}
            count={data.tasks.length}
          >
            <DashboardTasks tasks={data.tasks} />
          </Section>
        </div>

        <div className="order-6 lg:order-6 lg:col-span-1">
          <Section
            id="clientes"
            title="Clientes activos"
            count={data.clients.length}
            moreHref="/clientes"
          >
            <ActiveClients
              clients={data.clients.slice(0, CLIENTS_LIMIT)}
              today={data.today}
            />
          </Section>
        </div>
      </div>
    </>
  )
}
