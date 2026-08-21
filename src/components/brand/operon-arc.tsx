import { cn } from "@/lib/utils"

/** Arco Sol de marca. Se usa únicamente sobre fondos Tinta. */
export function OperonArc({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute size-64 rounded-full border-[36px] border-warning/30",
        className
      )}
    />
  )
}
