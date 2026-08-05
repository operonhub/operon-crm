"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  Target,
  Building2,
  FolderKanban,
  BarChart3,
  LogOut,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { logout } from "@/app/login/actions"

const NAV = [
  { href: "/", label: "Hoy", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/oportunidades", label: "Pipeline", icon: Target },
  { href: "/organizaciones", label: "Organizaciones", icon: Building2 },
  { href: "/proyectos", label: "Proyectos", icon: FolderKanban },
  { href: "/metricas", label: "Métricas", icon: BarChart3 },
]

export function AppSidebar({
  userName,
  userRole,
}: {
  userName: string
  userRole: string
}) {
  const pathname = usePathname()

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">
          O
        </div>
        <span className="font-semibold">Operon CRM</span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t p-3">
        <div className="mb-2 px-1">
          <p className="truncate text-sm font-medium">{userName}</p>
          <p className="text-xs text-muted-foreground capitalize">{userRole}</p>
        </div>
        <form action={logout}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Salir
          </Button>
        </form>
      </div>
    </aside>
  )
}
