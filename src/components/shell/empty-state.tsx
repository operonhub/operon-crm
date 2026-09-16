import { ENTER } from "@/lib/motion"
import { cn } from "@/lib/utils"

/**
 * Estado vacío. Reemplaza las ~24 tarjetas punteadas hechas a mano.
 *
 * Tres partes, siempre en este orden: qué pasa, por qué, y qué hacer. Un estado
 * vacío sin la tercera es un callejón sin salida.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  size = "md",
  className,
}: {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  size?: "sm" | "md"
  className?: string
}) {
  return (
    <div
      className={cn(
        ENTER,
        "flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 text-center",
        size === "sm" ? "px-5 py-8" : "min-h-72 px-6 py-12",
        className
      )}
    >
      {icon && (
        <span
          className={cn(
            "flex items-center justify-center rounded-full bg-muted text-muted-foreground",
            size === "sm" ? "size-9 [&_svg]:size-4" : "size-12 [&_svg]:size-5"
          )}
        >
          {icon}
        </span>
      )}
      <p className={cn("font-heading font-semibold", icon && "mt-4", size === "md" && "text-lg")}>
        {title}
      </p>
      {description && (
        <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
