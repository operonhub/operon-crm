import { OperonArc } from "@/components/brand/operon-arc"
import { ENTER, ENTER_UP } from "@/lib/motion"
import { cn } from "@/lib/utils"

/**
 * Encabezado de sección. Reemplaza los tres sistemas que convivían: los heros
 * copiados a mano en siete páginas, `PageHeader` y el hero de *Hoy*.
 *
 * Dos tonos, con criterio:
 * - `default` — para las secciones de trabajo diario (Clientes, Pipeline,
 *   Finanzas…). Presencia tipográfica, fondo papel, sin decoración: se ve todos
 *   los días y no tiene que cansar.
 * - `featured` — fondo tinta con el arco Sol, el lenguaje de *Hoy*. Para las
 *   secciones de marketing (Redes, Reels, Meta Ads), que son vidriera. El arco
 *   va sólo sobre tinta, como pide `OperonArc`.
 */
export function PageHero({
  eyebrow,
  title,
  description,
  actions,
  tone = "default",
  inset = true,
  children,
}: {
  eyebrow?: string
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  tone?: "default" | "featured"
  /**
   * Con márgenes propios (`true`, el caso normal) o sin ellos, para las
   * páginas que ya envuelven todo en su propio contenedor con padding.
   */
  inset?: boolean
  /** Contenido extra dentro del hero, debajo del título (p. ej. KPIs). */
  children?: React.ReactNode
}) {
  if (tone === "featured") {
    return (
      <header className={cn(inset && "px-3 pt-3 sm:px-5 sm:pt-5")}>
        <div
          className={cn(
            ENTER,
            "relative isolate overflow-hidden rounded-2xl bg-[#14130F] px-5 py-6 text-[#FBF9F4] shadow-xl shadow-foreground/10 ring-1 ring-white/5 sm:px-8 sm:py-8 dark:bg-[#1C1B16] dark:ring-white/10"
          )}
        >
          <OperonArc className="-right-28 -top-32" />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-28 right-32 hidden size-44 rounded-full border-[28px] border-primary/25 sm:block"
          />
          <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className={cn(ENTER_UP, "min-w-0")}>
              {eyebrow && <p className="label-mono text-[#F2C94C]">{eyebrow}</p>}
              <h1 className="mt-2 text-[clamp(1.9rem,4vw,3rem)] leading-[0.98] font-semibold tracking-[-0.045em]">
                {title}
              </h1>
              {description && (
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#FBF9F4]/65 sm:text-base">
                  {description}
                </p>
              )}
            </div>
            {actions && (
              <div className="relative z-20 flex shrink-0 flex-wrap items-center gap-2">
                {actions}
              </div>
            )}
          </div>
          {children && <div className="relative z-10 mt-6">{children}</div>}
        </div>
      </header>
    )
  }

  return (
    <header className={cn(inset && "mx-auto w-full max-w-[1600px] px-4 pt-5 sm:px-6 sm:pt-7")}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className={cn(ENTER_UP, "min-w-0")}>
          {eyebrow && <p className="label-mono text-primary">{eyebrow}</p>}
          <h1 className="mt-1.5 text-[clamp(1.75rem,3.2vw,2.5rem)] leading-[1.02] font-semibold tracking-[-0.04em]">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </header>
  )
}
