import { NextRequest, NextResponse } from "next/server"
import { AuthorizationError, requireMember } from "@/lib/auth"
import { reservasCsv, type ExportDataset } from "@/lib/reservas-sales"
import { loadReservasExport, ReservasExportLimitError } from "@/lib/reservas-sales-server"
import { TIMEZONE } from "@/lib/format"

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format") ?? "json"
  const dataset = request.nextUrl.searchParams.get("dataset") ?? "prospectos"
  if (!["json", "csv"].includes(format) || !["prospectos", "eventos", "mensajes"].includes(dataset)) {
    return NextResponse.json({ error: "Formato inválido." }, { status: 400 })
  }
  try {
    const { supabase } = await requireMember()
    const startedAt = new Date().toISOString()
    const rows = await loadReservasExport(supabase)
    const headers = {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="operon-reservas-${format === "json" ? "completo.json" : `${dataset}.csv`}"`,
    }
    if (format === "csv") return new Response(reservasCsv(rows, dataset as ExportDataset), {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" },
    })
    return NextResponse.json({
      schema_version: 1, scope: "operon_reservas", started_at: startedAt,
      completed_at: new Date().toISOString(), timezone: TIMEZONE,
      prospect_count: rows.length, filtered: false,
      consistency: "Lectura paginada; los datos pueden cambiar durante la exportación.",
      prospects: rows,
    }, { headers })
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : error instanceof ReservasExportLimitError ? 413 : 503
    const message = error instanceof AuthorizationError || error instanceof ReservasExportLimitError ? error.message : "No se pudo completar el export. No se descargó un archivo parcial."
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } })
  }
}
