import { notFound, redirect } from "next/navigation"
import { AgentDetailWorkspace } from "@/components/agents/agent-detail-workspace"
import { createClient } from "@/lib/supabase/server"

export default async function AgentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [agentRes, runsRes, approvalsRes, projectsRes, profilesRes, auditRes, currentProfileRes] =
    await Promise.all([
      supabase
        .from("agents")
        .select("*, owner:profiles!agents_owner_id_fkey(full_name)")
        .eq("id", id)
        .single(),
      supabase
        .from("agent_runs")
        .select(
          "*, project:projects(name), client:clients(organization:organizations(name)), initiator:profiles!agent_runs_initiated_by_fkey(full_name)"
        )
        .eq("agent_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("agent_approvals")
        .select(
          "*, requester:profiles!agent_approvals_requested_by_fkey(full_name), decider:profiles!agent_approvals_decided_by_fkey(full_name)"
        )
        .eq("agent_id", id)
        .order("requested_at", { ascending: false }),
      supabase
        .from("project_agents")
        .select("project_id, responsibility, project:projects(id, name, status)")
        .eq("agent_id", id),
      supabase.from("profiles").select("id, full_name").order("full_name"),
      supabase
        .from("audit_log")
        .select("id, action, metadata, created_at, actor:profiles!audit_log_user_id_fkey(full_name)")
        .eq("entity", "agent")
        .eq("entity_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("profiles").select("role").eq("id", user.id).single(),
    ])

  if (agentRes.error || !agentRes.data) notFound()

  return (
    <AgentDetailWorkspace
      agent={agentRes.data}
      runs={runsRes.data ?? []}
      approvals={approvalsRes.data ?? []}
      projects={projectsRes.data ?? []}
      profiles={profilesRes.data ?? []}
      activity={auditRes.data ?? []}
      isAdmin={currentProfileRes.data?.role === "admin"}
      tab={tab ?? "resumen"}
    />
  )
}
