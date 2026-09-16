import { ViewTransition } from "react"

/**
 * Transición de entrada de una pantalla.
 *
 * Va en cada `page.tsx`, no en el layout: el layout persiste entre
 * navegaciones y ahí `enter`/`exit` nunca se disparan (lo aclara la guía de
 * view transitions de Next 16).
 *
 * `default="none"` es lo que la hace cómoda a diario: sin eso, cualquier
 * transición de la página —un `router.refresh()`, una pestaña, un Suspense que
 * se resuelve— volvería a animar la pantalla entera. Sólo anima al entrar.
 *
 * Sin soporte de View Transitions en el navegador, simplemente no anima.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      <div>{children}</div>
    </ViewTransition>
  )
}
