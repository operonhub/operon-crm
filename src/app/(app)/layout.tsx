import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { AppSidebar, MobileNav } from "@/components/app-sidebar"
import { RefreshOnFocus } from "@/components/refresh-on-focus"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const [{ data: profile }, { count: unreadCount }] = await Promise.all([
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
  ])

  const userName = profile?.full_name || user.email || "Usuario"
  const userRole = profile?.role || "operador"

  return (
    <div className="flex h-dvh overflow-hidden">
      <RefreshOnFocus />
      <AppSidebar
        userName={userName}
        userRole={userRole}
        unreadCount={unreadCount ?? 0}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <MobileNav
          userName={userName}
          userRole={userRole}
          unreadCount={unreadCount ?? 0}
        />
        <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-muted/20">
          {children}
        </main>
      </div>
    </div>
  )
}
