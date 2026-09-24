import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { AppSidebar, MobileBottomNav, MobileNav } from "@/components/app-sidebar"
import { RefreshOnFocus } from "@/components/refresh-on-focus"
import { SpotlightTracker } from "@/components/shell/spotlight-tracker"
import { AssistantMount } from "@/components/assistant/assistant-mount"
import { getSessionUser } from "@/lib/auth"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [supabase, user] = await Promise.all([createClient(), getSessionUser()])

  if (!user) redirect("/login")

  const [{ data: profile }, { count: teamUnread }, { count: clientUnread }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single(),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .is("read_at", null),
    // Chats de WhatsApp e Instagram esperando respuesta. Sin esto el badge de
    // Bandeja decía "0" aunque un cliente llevara horas escribiendo.
    supabase
      .from("social_conversations")
      .select("id", { count: "exact", head: true })
      .gt("unread_count", 0)
      .neq("status", "archived"),
  ])
  const unreadCount = (teamUnread ?? 0) + (clientUnread ?? 0)

  const userName = profile?.full_name || user.email || "Usuario"
  const userRole = profile?.role || "operador"

  return (
    <div className="flex h-dvh overflow-hidden">
      <RefreshOnFocus />
      <SpotlightTracker />
      <AppSidebar
        userName={userName}
        userRole={userRole}
        unreadCount={unreadCount}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <MobileNav
          userName={userName}
          userRole={userRole}
          unreadCount={unreadCount}
        />
        <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-muted/20">
          {children}
        </main>
        <MobileBottomNav unreadCount={unreadCount} />
      </div>
      {/*
        Hermano de <main>, no hijo: dentro del slot `children` se remontaría en
        cada navegación y se perdería la conversación en curso.
      */}
      <AssistantMount />
    </div>
  )
}
