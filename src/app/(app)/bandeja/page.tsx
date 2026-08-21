import { redirect } from "next/navigation"
import { InboxWorkspace } from "@/components/inbox/inbox-workspace"
import { createClient } from "@/lib/supabase/server"

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string
    conversation?: string
    status?: string
    assigned?: string
  }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [conversationsRes, profilesRes, projectsRes, notificationsRes] =
    await Promise.all([
      supabase
        .from("conversations")
        .select(
          `id, title, channel, status, context_type, assigned_to, last_message_at, created_at,
           client_id, opportunity_id, project_id, task_id, financial_record_id, agent_id,
           assigned:profiles!conversations_assigned_to_fkey(full_name),
           creator:profiles!conversations_created_by_fkey(full_name),
           participants:conversation_participants(profile_id, last_read_at),
           client:clients(organization:organizations(name)),
           opportunity:opportunities(title),
           project:projects(name),
           task:project_tasks(title),
           finance:financial_records(concept),
           agent:agents(name)`
        )
        .eq("channel", "team")
        .order("last_message_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, role").order("full_name"),
      supabase
        .from("projects")
        .select("id, name")
        .is("archived_at", null)
        .order("name"),
      supabase
        .from("notifications")
        .select("id, notification_type, title, body, href, read_at, created_at, actor:profiles!notifications_actor_id_fkey(full_name)")
        .eq("recipient_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ])

  const conversations = conversationsRes.data ?? []
  const selectedId =
    params.conversation && conversations.some((item) => item.id === params.conversation)
      ? params.conversation
      : conversations[0]?.id

  const [messagesRes, decisionsRes, handoffsRes, reviewsRes] = selectedId
    ? await Promise.all([
        supabase
          .from("conversation_messages")
          .select("id, body, message_kind, created_at, author_id, author:profiles!conversation_messages_author_id_fkey(full_name)")
          .eq("conversation_id", selectedId)
          .order("created_at"),
        supabase
          .from("decisions")
          .select("id, title, body, decided_at, decided_by, profile:profiles!decisions_decided_by_fkey(full_name)")
          .eq("conversation_id", selectedId)
          .order("decided_at", { ascending: false }),
        supabase
          .from("assignment_handoffs")
          .select("id, note, status, created_at, from:profiles!assignment_handoffs_from_profile_id_fkey(full_name), to:profiles!assignment_handoffs_to_profile_id_fkey(full_name)")
          .eq("conversation_id", selectedId)
          .order("created_at", { ascending: false }),
        supabase
          .from("review_requests")
          .select("id, note, status, created_at, requester:profiles!review_requests_requested_by_fkey(full_name), reviewer:profiles!review_requests_requested_from_fkey(full_name)")
          .eq("conversation_id", selectedId)
          .order("created_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]

  return (
    <InboxWorkspace
      currentProfileId={user.id}
      tab={params.tab === "clientes" || params.tab === "sistema" ? params.tab : "equipo"}
      statusFilter={params.status ?? "open"}
      assignedFilter={params.assigned ?? "all"}
      conversations={conversations}
      selectedId={selectedId ?? null}
      messages={messagesRes.data ?? []}
      decisions={decisionsRes.data ?? []}
      handoffs={handoffsRes.data ?? []}
      reviews={reviewsRes.data ?? []}
      notifications={notificationsRes.data ?? []}
      profiles={profilesRes.data ?? []}
      projects={projectsRes.data ?? []}
    />
  )
}
