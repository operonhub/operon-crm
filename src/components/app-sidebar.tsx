"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  UsersRound,
  Target,
  FolderKanban,
  BarChart3,
  WalletCards,
  LogOut,
  Menu,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { OperonMark } from "@/components/brand/operon-mark"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { logout } from "@/app/login/actions"

const NAV = [
  { href: "/", label: "Hoy", icon: LayoutDashboard, aliases: [] },
  { href: "/clientes", label: "Clientes", icon: UsersRound, aliases: ["/organizaciones"] },
  { href: "/oportunidades", label: "Pipeline", icon: Target, aliases: ["/leads"] },
  { href: "/proyectos", label: "Proyectos", icon: FolderKanban, aliases: [] },
  { href: "/metricas", label: "Métricas", icon: BarChart3, aliases: [] },
  { href: "/finanzas", label: "Finanzas", icon: WalletCards, aliases: [] },
]

function isActive(pathname: string, href: string, aliases: string[]) {
  if (href === "/") return pathname === "/"
  return [href, ...aliases].some((path) => pathname.startsWith(path))
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="flex-1 space-y-1 p-3">
      {NAV.map(({ href, label, icon: Icon, aliases }) => {
        const active = isActive(pathname, href, aliases)
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

function UserFooter({
  userName,
  userRole,
  withThemeToggle = true,
}: {
  userName: string
  userRole: string
  withThemeToggle?: boolean
}) {
  return (
    <div className="border-t p-3">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{userName}</p>
          <p className="text-xs text-muted-foreground capitalize">{userRole}</p>
        </div>
        {withThemeToggle && <ThemeToggle />}
      </div>
      <form action={logout}>
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
        >
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          Salir
        </Button>
      </form>
    </div>
  )
}

/** Sidebar fijo. Se oculta por debajo de `md`, donde manda `MobileNav`. */
export function AppSidebar({
  userName,
  userRole,
}: {
  userName: string
  userRole: string
}) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <OperonMark className="h-7 w-5 shrink-0" />
        <span className="font-heading text-sm font-semibold tracking-tight">
          Operon CRM
        </span>
      </div>
      <NavLinks />
      <UserFooter userName={userName} userRole={userRole} />
    </aside>
  )
}

/** Barra superior de mobile: abre la misma navegación dentro de un drawer. */
export function MobileNav({
  userName,
  userRole,
}: {
  userName: string
  userRole: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label="Abrir navegación" />
          }
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </SheetTrigger>
        <SheetContent
          side="left"
          className="flex w-64 flex-col bg-sidebar text-sidebar-foreground"
        >
          <SheetHeader className="border-b pb-3">
            <SheetTitle className="flex items-center gap-2">
              <OperonMark className="h-6 w-[17px] shrink-0" />
              Operon CRM
            </SheetTitle>
          </SheetHeader>
          <NavLinks onNavigate={() => setOpen(false)} />
          <UserFooter
            userName={userName}
            userRole={userRole}
            withThemeToggle={false}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 items-center gap-2">
        <OperonMark className="h-6 w-[17px] shrink-0" />
        <span className="truncate font-heading text-sm font-semibold tracking-tight">
          Operon CRM
        </span>
      </div>

      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </div>
  )
}
