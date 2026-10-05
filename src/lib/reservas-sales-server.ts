import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { ReservasExportRow, ReservasPanel } from "@/lib/reservas-sales"

export class ReservasExportLimitError extends Error {}

export async function loadReservasPanel(supabase: SupabaseClient<Database>, filters: {
  page?: number; search?: string; stage?: string; attention?: string
} = {}): Promise<ReservasPanel> {
  const { data, error } = await supabase.rpc("get_reservas_sales_panel", {
    p_page: filters.page ?? 1, p_search: filters.search ?? "",
    p_stage: filters.stage ?? "", p_attention: filters.attention ?? "",
  })
  if (error || !data) throw new Error("No se pudo consultar la prospección de Operon Reservas.")
  return data as unknown as ReservasPanel
}

/** Keyset pagination avoids Supabase's 1000-row ceiling; never return a truncated export. */
export async function loadReservasExport(supabase: SupabaseClient<Database>): Promise<ReservasExportRow[]> {
  const rows: ReservasExportRow[] = []
  let after: string | undefined
  for (;;) {
    const { data, error } = await supabase.rpc("get_reservas_sales_export_page", after ? { p_after: after } : {})
    if (error || !Array.isArray(data)) throw new Error("No se pudo completar la exportación.")
    const page = data as unknown as ReservasExportRow[]
    rows.push(...page)
    if (rows.length > 5000) throw new ReservasExportLimitError("El export completo supera 5000 prospectos. Se requiere exportación por período.")
    if (page.length < 100) return rows
    after = page.at(-1)!.id
  }
}
