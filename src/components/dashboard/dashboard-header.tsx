import { formatLongDate, greeting } from "@/lib/format"
import { ScopeToggle } from "@/components/dashboard/scope-toggle"
import { QuickCreateMenu } from "@/components/dashboard/quick-create"
import type { DashboardScope, QuickCreateOptions } from "@/lib/dashboard/queries"

/**
 * Server Component: el saludo y la fecha se calculan en el servidor con la
 * hora de Argentina, así no hay desajuste de hidratación.
 */
export function DashboardHeader({
  fullName,
  scope,
  options,
}: {
  fullName: string
  scope: DashboardScope
  options: QuickCreateOptions
}) {
  const firstName = fullName.trim().split(/\s+/)[0] || "equipo"

  return (
    <header className="border-b bg-background px-4 py-3 sm:px-6">
      <div className="flex flex-col gap-3 sm:h-14 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-0">
        <div className="min-w-0">
          <h1 className="truncate font-heading text-lg leading-tight font-semibold tracking-tight">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground first-letter:uppercase">
            {formatLongDate()}
          </p>
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <ScopeToggle scope={scope} />
          <QuickCreateMenu options={options} />
        </div>
      </div>
    </header>
  )
}
