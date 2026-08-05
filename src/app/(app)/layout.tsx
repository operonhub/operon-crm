import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { AppSidebar } from "@/components/app-sidebar"

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single()

  return (
    <div className="flex min-h-screen">
      <AppSidebar
        userName={profile?.full_name || user.email || "Usuario"}
        userRole={profile?.role || "operador"}
      />
      <main className="flex-1 overflow-x-hidden bg-muted/20">{children}</main>
    </div>
  )
}
