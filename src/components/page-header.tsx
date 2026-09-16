import { PageHero } from "@/components/shell/page-hero"

/**
 * Encabezado compacto histórico. Ahora delega en `PageHero`, así las nueve
 * páginas que lo usan adoptan el lenguaje nuevo sin cambiar su código.
 * `children` sigue siendo el lugar de las acciones.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  eyebrow?: string
  children?: React.ReactNode
}) {
  return <PageHero eyebrow={eyebrow} title={title} description={description} actions={children} />
}
