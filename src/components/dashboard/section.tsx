import Link from "next/link"
import { ArrowRight } from "lucide-react"

/** Encabezado de sección del panel: etiqueta en mono, conteo y enlace opcional. */
export function Section({
  id,
  title,
  count,
  moreHref,
  moreLabel,
  children,
}: {
  id: string
  title: string
  count?: number
  moreHref?: string
  moreLabel?: string
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="min-w-0">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2
          id={`${id}-title`}
          className="font-mono text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
        >
          {title}
          {count !== undefined && (
            <span className="ml-2 tabular-nums text-foreground">{count}</span>
          )}
        </h2>
        {moreHref && (
          <Link
            href={moreHref}
            className="group inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {moreLabel ?? "Ver todos"}
            <ArrowRight
              className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

/** Estado vacío discreto: una línea, no una tarjeta enorme. */
export function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}
