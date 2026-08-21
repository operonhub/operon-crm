import Link from "next/link"
import { Bot, CircleAlert, CircleCheck, Clock3, ShieldCheck } from "lucide-react"
import { AgentCreateDialog } from "@/components/agents/agent-create-dialog"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { deriveAgentMetrics } from "@/lib/agents"
import { roleLabel } from "@/lib/permissions"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

const STATUS_LABELS = {
  draft: "Borrador",
  active: "Activo",
  paused: "Pausado",
  archived: "Archivado",
} as const

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; owner?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [agentsRes, profilesRes, currentProfileRes] = await Promise.all([
    supabase
      .from("agents")
      .select(
        `id, name, slug, description, purpose, status, owner_id, updated_at,
         owner:profiles!agents_owner_id_fkey(full_name),
         agent_runs(status, started_at, finished_at),
         agent_approvals(status)`
      )
      .order("updated_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name").order("full_name"),
    user
      ? supabase.from("profiles").select("role").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
  ])

  const query = params.q?.trim().toLocaleLowerCase("es") ?? ""
  const agents = (agentsRes.data ?? []).filter((agent) => {
    if (params.status && params.status !== "all" && agent.status !== params.status) return false
    if (params.owner && params.owner !== "all" && agent.owner_id !== params.owner) return false
    if (query && !`${agent.name} ${agent.description ?? ""} ${agent.purpose ?? ""}`.toLocaleLowerCase("es").includes(query)) return false
    return true
  })
  const isAdmin = currentProfileRes.data?.role === "admin"

  return (
    <div className="mx-auto w-full max-w-[1500px] p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="label-mono text-primary">Comunicación y sistemas</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Agentes</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Catálogo y control de permisos, ejecuciones y aprobaciones reales. Sin runner simulado.
          </p>
          <p className="label-mono mt-2 text-muted-foreground">
            Tu rol: {roleLabel(currentProfileRes.data?.role ?? "operador")}
          </p>
        </div>
        <AgentCreateDialog profiles={profilesRes.data ?? []} isAdmin={isAdmin} />
      </div>

      <form className="mt-6 grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-[minmax(12rem,1fr)_12rem_12rem_auto]">
        <Input name="q" defaultValue={params.q} placeholder="Buscar agente" />
        <select name="status" defaultValue={params.status ?? "all"} className="h-9 rounded-lg border bg-transparent px-3 text-sm">
          <option value="all">Todos los estados</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select name="owner" defaultValue={params.owner ?? "all"} className="h-9 rounded-lg border bg-transparent px-3 text-sm">
          <option value="all">Todo el equipo</option>
          {(profilesRes.data ?? []).map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}
        </select>
        <button className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Filtrar</button>
      </form>

      {agents.length === 0 ? (
        <Card className="mt-6 flex min-h-80 flex-col items-center justify-center border-dashed p-8 text-center">
          <Bot className="size-10 text-muted-foreground/40" />
          <p className="mt-4 font-heading font-semibold">No hay agentes con esos filtros</p>
          <p className="mt-1 text-sm text-muted-foreground">Creá un borrador o ajustá la búsqueda.</p>
        </Card>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => {
            const metrics = deriveAgentMetrics(agent.agent_runs, agent.agent_approvals)
            return (
              <Link key={agent.id} href={`/agentes/${agent.id}`} className="group rounded-xl outline-none">
                <Card className="h-full gap-0 overflow-hidden py-0 transition-all group-hover:-translate-y-0.5 group-hover:shadow-lg group-focus-visible:ring-3 group-focus-visible:ring-ring/50 motion-reduce:group-hover:translate-y-0">
                  <CardContent className="flex h-full flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bot className="size-5" /></span>
                      <Badge variant="outline" className={cn(agent.status === "active" && "border-success/30 bg-success/10 text-success", agent.status === "paused" && "border-warning/50 bg-warning/15 text-foreground")}>{STATUS_LABELS[agent.status]}</Badge>
                    </div>
                    <h2 className="mt-5 font-heading text-lg font-semibold">{agent.name}</h2>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{agent.description || agent.purpose || "Sin descripción"}</p>
                    <div className="mt-5 grid grid-cols-3 gap-2 border-y py-3 text-center">
                      <Metric icon={CircleCheck} label="Ejecuciones" value={String(metrics.totalRuns)} />
                      <Metric icon={CircleAlert} label="Errores" value={String(metrics.failedRuns)} />
                      <Metric icon={ShieldCheck} label="Pendientes" value={String(metrics.pendingApprovals)} />
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-muted-foreground">
                      <span>{agent.owner?.full_name ?? "Sin responsable"}</span>
                      <span className="inline-flex items-center gap-1"><Clock3 className="size-3" />{metrics.successRate === null ? "Sin datos" : `${metrics.successRate}% éxito`}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Metric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return <div><Icon className="mx-auto size-3.5 text-muted-foreground" /><p className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</p><p className="label-mono mt-1 truncate text-muted-foreground">{label}</p></div>
}
