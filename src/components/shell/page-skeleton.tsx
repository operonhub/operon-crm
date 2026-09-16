import { Skeleton } from "@/components/ui/skeleton"

/**
 * Esqueletos de carga por forma de pantalla.
 *
 * Cada `loading.tsx` de `src/app/(app)` elige la variante que se parece a lo
 * que va a llegar, para que el contenido real aparezca en el mismo lugar y no
 * haya saltos. Server component puro: ni un byte de JavaScript en el cliente.
 *
 * Tienen dos trabajos: pintar algo al instante al navegar, y habilitar que Next
 * precargue las rutas dinámicas, que sin `loading.tsx` no precarga.
 */

type Variant = "dashboard" | "list" | "board" | "detail" | "inbox" | "grid" | "metrics" | "cards"

function Hero() {
  return (
    <div className="mb-6 space-y-2">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>
  )
}

function Kpis({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-2 rounded-xl border bg-card p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-24" />
        </div>
      ))}
    </div>
  )
}

function Rows({ count = 8 }: { count?: number }) {
  return (
    <div className="divide-y rounded-xl border bg-card">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}

export function PageSkeleton({ variant = "list" }: { variant?: Variant }) {
  return (
    <div
      className="mx-auto w-full max-w-[1600px] p-4 sm:p-6"
      role="status"
      aria-live="polite"
      aria-label="Cargando"
    >
      {variant === "dashboard" ? (
        <div className="space-y-6">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Kpis />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <Rows count={5} />
            <Rows count={4} />
          </div>
        </div>
      ) : variant === "inbox" ? (
        <>
          <Hero />
          <Skeleton className="mb-4 h-10 w-72 rounded-xl" />
          <div className="grid min-h-[calc(100dvh-18rem)] overflow-hidden rounded-2xl border bg-card lg:grid-cols-[22rem_minmax(0,1fr)]">
            <div className="space-y-1 border-b p-2 lg:border-r lg:border-b-0">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="flex gap-3 rounded-lg px-2 py-3">
                  <Skeleton className="size-9 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden flex-col justify-end gap-3 p-6 lg:flex">
              <Skeleton className="h-12 w-2/5 rounded-2xl" />
              <Skeleton className="ml-auto h-16 w-1/2 rounded-2xl" />
              <Skeleton className="h-10 w-1/3 rounded-2xl" />
              <Skeleton className="mt-4 h-12 w-full rounded-xl" />
            </div>
          </div>
        </>
      ) : variant === "grid" ? (
        <>
          <Hero />
          <Skeleton className="mb-4 h-10 w-64 rounded-xl" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="overflow-hidden rounded-xl border bg-card">
                <Skeleton className="aspect-[4/5] w-full rounded-none" />
                <div className="space-y-2 p-3">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : variant === "metrics" ? (
        <>
          <Hero />
          <Kpis />
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-64 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </>
      ) : variant === "board" ? (
        <>
          <Hero />
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="w-64 shrink-0 space-y-2 rounded-xl border bg-card p-3">
                <Skeleton className="h-4 w-24" />
                {Array.from({ length: 3 - (i % 2) }, (_, j) => (
                  <Skeleton key={j} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ))}
          </div>
        </>
      ) : variant === "detail" ? (
        <>
          <Hero />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-4">
              <Skeleton className="h-10 w-80 max-w-full rounded-xl" />
              <Rows count={6} />
            </div>
            <div className="space-y-3">
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
          </div>
        </>
      ) : variant === "cards" ? (
        <>
          <Hero />
          <div className="space-y-4">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-36 w-full rounded-xl" />
            ))}
          </div>
        </>
      ) : (
        <>
          <Hero />
          <Skeleton className="mb-4 h-10 w-full max-w-xl rounded-xl" />
          <Rows />
        </>
      )}
    </div>
  )
}
