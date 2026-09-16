"use client"

import { usePathname } from "next/navigation"
import { UrlTabs } from "@/components/shell/url-tabs"

/**
 * Pipeline ↔ Leads. Son dos rutas distintas, pero comparten el grupo de
 * pestañas: el indicador se desliza de una a otra al cambiar de página, porque
 * las dos renderizan `UrlTabs` con el mismo `id`.
 */
export function PipelineTabs() {
  const pathname = usePathname()
  return (
    <UrlTabs
      id="pipeline"
      size="sm"
      active={pathname.startsWith("/leads") ? "leads" : "pipeline"}
      tabs={[
        { value: "pipeline", label: "Pipeline", href: "/oportunidades" },
        { value: "leads", label: "Leads", href: "/leads" },
      ]}
    />
  )
}
