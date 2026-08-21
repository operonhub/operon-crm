import { OperonArc } from "@/components/brand/operon-arc"
import { OperonMarkPapel } from "@/components/brand/operon-mark"
import { QuickCreateMenu } from "@/components/dashboard/quick-create"
import { ScopeToggle } from "@/components/dashboard/scope-toggle"
import { formatLongDate, greeting } from "@/lib/format"
import { ENTER } from "@/lib/motion"
import type {
  DashboardScope,
  QuickCreateOptions,
} from "@/lib/dashboard/queries"

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
    <header className="px-3 pt-3 sm:px-5 sm:pt-5">
      <div
        className={`${ENTER} relative isolate min-h-56 overflow-hidden rounded-2xl bg-[#14130F] px-5 pb-16 pt-6 text-[#FBF9F4] shadow-xl shadow-foreground/10 sm:px-8 sm:pb-20 sm:pt-8`}
      >
        <OperonArc className="-right-24 -top-28" />
        <span className="absolute -bottom-24 right-24 size-44 rounded-full border-[28px] border-primary/25" />
        <div className="relative z-10 flex flex-col items-start justify-between gap-5 sm:flex-row">
          <div className="flex min-w-0 items-start gap-4">
            <OperonMarkPapel className="mt-1 hidden h-14 w-10 shrink-0 sm:block" />
            <div className="min-w-0">
              <p className="label-mono text-[#F2C94C]">Centro operativo</p>
              <h1 className="mt-3 max-w-2xl text-[clamp(2rem,5vw,3.7rem)] leading-[0.96] font-semibold tracking-[-0.045em]">
                {greeting()}, {firstName}.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#FBF9F4]/65 sm:text-base">
                Lo importante de hoy, con responsables, fechas y contexto para
                que el equipo avance sin perder el hilo.
              </p>
              <p className="label-mono mt-4 text-[#FBF9F4]/50 first-letter:uppercase">
                {formatLongDate()}
              </p>
            </div>
          </div>
          <div className="relative z-20 flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
            <div className="rounded-lg bg-[#FBF9F4] p-1 text-[#14130F] shadow-sm">
              <ScopeToggle scope={scope} />
            </div>
            <QuickCreateMenu options={options} />
          </div>
        </div>
      </div>
    </header>
  )
}
