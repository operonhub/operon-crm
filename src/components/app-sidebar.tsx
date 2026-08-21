"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart3,
  Bot,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Target,
  UsersRound,
  WalletCards,
} from "lucide-react"
import { logout } from "@/app/login/actions"
import { OperonMark } from "@/components/brand/operon-mark"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { roleLabel, type InternalRole } from "@/lib/permissions"
import { cn } from "@/lib/utils"

type NavItem = {
  href: string
  label: string
  icon: React.ElementType
  aliases?: string[]
  badge?: number
}
const PRODUCT_NAV: NavItem[] = [
  { href: "/", label: "Hoy", icon: LayoutDashboard },
  {
    href: "/clientes",
    label: "Clientes",
    icon: UsersRound,
    aliases: ["/organizaciones"],
  },
  {
    href: "/oportunidades",
    label: "Pipeline",
    icon: Target,
    aliases: ["/leads"],
  },
  { href: "/proyectos", label: "Proyectos", icon: FolderKanban },
  { href: "/metricas", label: "Métricas", icon: BarChart3 },
  { href: "/finanzas", label: "Finanzas", icon: WalletCards },
]

function isActive(pathname: string, item: NavItem) {
  if (item.href === "/") return pathname === "/"
  return [item.href, ...(item.aliases ?? [])].some((path) =>
    pathname.startsWith(path)
  )
}

function NavGroup({
  label,
  items,
  onNavigate,
}: {
  label?: string
  items: NavItem[]
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  return (
    <div>
      {label && (
        <p className="label-mono mb-1.5 px-3 text-muted-foreground/75">
          {label}
        </p>
      )}
      <div className="space-y-1">
        {items.map((item) => {
          const active = isActive(pathname, item)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0 transition-transform",
                  !active && "group-hover:scale-110"
                )}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {!!item.badge && (
                <span
                  className={cn(
                    "label-mono min-w-5 rounded-full px-1.5 py-0.5 text-center",
                    active
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-warning/25 text-foreground"
                  )}
                  aria-label={`${item.badge} sin leer`}
                >
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function SidebarNav({
  userName,
  userRole,
  unreadCount,
  onNavigate,
  withThemeToggle = true,
}: {
  userName: string
  userRole: InternalRole
  unreadCount: number
  onNavigate?: () => void
  withThemeToggle?: boolean
}) {
  const communicationNav: NavItem[] = [
    { href: "/bandeja", label: "Bandeja", icon: Inbox, badge: unreadCount },
    { href: "/agentes", label: "Agentes", icon: Bot },
  ]

  return (
    <>
      <div className="flex h-14 items-center gap-2.5 border-b px-4">
        <OperonMark className="h-7 w-5 shrink-0" />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-heading text-sm font-semibold tracking-tight">
            OperonHub
          </span>
          <span className="label-mono text-muted-foreground">CRM interno</span>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto p-3">
        <NavGroup items={PRODUCT_NAV} onNavigate={onNavigate} />
        <NavGroup
          label="Comunicación y sistemas"
          items={communicationNav}
          onNavigate={onNavigate}
        />
      </nav>

      <div className="border-t p-3">
        <div className="mb-2 flex items-start justify-between gap-2 px-1">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{userName}</p>
            <p className="label-mono text-muted-foreground">
              {roleLabel(userRole)}
            </p>
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
            <LogOut className="mr-2 size-4" aria-hidden="true" />
            Salir
          </Button>
        </form>
      </div>
    </>
  )
}

export function AppSidebar({
  userName,
  userRole,
  unreadCount,
}: {
  userName: string
  userRole: InternalRole
  unreadCount: number
}) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground lg:flex">
      <SidebarNav
        userName={userName}
        userRole={userRole}
        unreadCount={unreadCount}
      />
    </aside>
  )
}

export function MobileNav({
  userName,
  userRole,
  unreadCount,
}: {
  userName: string
  userRole: InternalRole
  unreadCount: number
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label="Abrir navegación" />
          }
        >
          <Menu className="size-5" aria-hidden="true" />
        </SheetTrigger>
        <SheetContent
          side="left"
          className="flex w-72 flex-col bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navegación de Operon CRM</SheetTitle>
          </SheetHeader>
          <SidebarNav
            userName={userName}
            userRole={userRole}
            unreadCount={unreadCount}
            onNavigate={() => setOpen(false)}
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
      {unreadCount > 0 && (
        <Link
          href="/bandeja"
          className="label-mono ml-auto rounded-full bg-warning/25 px-2 py-1 text-foreground"
        >
          {unreadCount} sin leer
        </Link>
      )}
      <div className={cn(unreadCount === 0 && "ml-auto")}>
        <ThemeToggle />
      </div>
    </div>
  )
}
