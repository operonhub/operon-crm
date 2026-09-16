import { redirect } from "next/navigation"
import { InboxWorkspace } from "@/components/inbox/inbox-workspace"
import { createClient } from "@/lib/supabase/server"
import { readZernioConfig } from "@/lib/zernio/config"

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string
    conversation?: string
    status?: string
    assigned?: string
    canal?: string
  }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const tab =
    params.tab === "clientes" || params.tab === "sistema" ? params.tab : "equipo"
  const channel =
    params.canal === "whatsapp" || params.canal === "instagram" ? params.canal : "todos"

  const [conversationsRes, profilesRes, projectsRes, notificationsRes, profileRes] =
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
      supabase.from("profiles").select("role").eq("id", user.id).single(),
    ])

  const conversations = conversationsRes.data ?? []

  /**
   * La Bandeja de clientes sólo se consulta cuando esa pestaña está abierta.
   *
   * Son tablas distintas de las del equipo, así que traerlas siempre sería
   * pagar dos consultas de más en cada visita al tab "Equipo", que es el que
   * más se usa.
   */
  const zernio = readZernioConfig()
  const socialRes =
    tab === "clientes"
      ? await supabase
          .from("social_conversations")
          .select(
            `id, platform, participant_name, participant_handle, status, unread_count,
             last_message_at, last_message_preview, last_inbound_at, lead_id,
             account:social_accounts(username, display_name, is_active)`
          )
          .in(
            "platform",
            channel === "todos" ? ["whatsapp", "instagram", "facebook", "telegram", "other"] : [channel]
          )
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(200)
      : { data: [] }

  const socialConversations = socialRes.data ?? []

  // El id seleccionado se resuelve contra la lista de la pestaña activa: cada
  // una tiene sus propias conversaciones y sus propios ids.
  const pool: { id: string }[] = tab === "clientes" ? socialConversations : conversations
  const selectedId =
    params.conversation && pool.some((item) => item.id === params.conversation)
      ? params.conversation
      : pool[0]?.id

  const [messagesRes, decisionsRes, handoffsRes, reviewsRes] =
    selectedId && tab !== "clientes"
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

  const socialMessagesRes =
    selectedId && tab === "clientes"
      ? await supabase
          .from("social_messages")
          .select(
            "id, direction, body, delivery_status, sent_at, deleted_at, sender:profiles!social_messages_sent_by_fkey(full_name)"
          )
          .eq("conversation_id", selectedId)
          .order("sent_at")
          .limit(300)
      : { data: [] }

  return (
    <InboxWorkspace
      currentProfileId={user.id}
      tab={tab}
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
      socialConversations={socialConversations}
      socialMessages={socialMessagesRes.data ?? []}
      channel={channel}
      socialConfigured={zernio.configured}
      socialReason={zernio.configured ? null : zernio.reason}
      isAdmin={profileRes.data?.role === "admin"}
    />
  )
}
