import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react"
import { Card } from "@/components/ui/card"
import type { ReceivableHealth } from "@/lib/finance"
import { formatMoney } from "@/lib/format"
import { ENTER_UP, stagger } from "@/lib/motion"
import { cn } from "@/lib/utils"

/**
 * "De lo que me deben, ¿cuánto ya está vencido?" y "¿el mes da positivo?", por
 * moneda. Una barra por moneda en vez de otra fila de números: la proporción se
 * lee de un vistazo, y el número exacto está al lado.
 */
export function ReceivableHealthCard({ rows }: { rows: ReceivableHealth[] }) {
  const visible = rows.filter((row) => row.owed > 0 || row.netThisMonth !== 0)

  return (
    <Card className={cn(ENTER_UP, "spotlight gap-0 p-0")} style={stagger(4, 55)}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="font-heading text-sm font-semibold">Salud de cobros</h2>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <Legend className="bg-primary" label="Al día" />
          <Legend className="bg-destructive" label="Vencido" />
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No hay nada pendiente de cobro ni movimientos este mes.
        </p>
      ) : (
        <div className="divide-y">
          {visible.map((row, index) => (
            <div
              key={row.currency}
              className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-8"
            >
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-sm">
                    <span className="label-mono mr-2 text-muted-foreground">{row.currency}</span>
                    <span className="font-mono font-semibold tabular-nums">
                      {formatMoney(row.owed, row.currency)}
                    </span>
                    <span className="text-muted-foreground"> a cobrar</span>
                  </p>
                  {row.overduePct !== null && row.overduePct > 0 && (
                    <p className="flex items-center gap-1 text-xs font-medium text-destructive">
                      <AlertTriangle className="size-3.5" aria-hidden="true" />
                      {row.overduePct}% vencido
                    </p>
                  )}
                </div>
                {row.owed > 0 ? (
                  <div
                    className="flex h-2.5 overflow-hidden rounded-full bg-muted"
                    role="img"
                    aria-label={`${formatMoney(row.onTime, row.currency)} al día y ${formatMoney(row.overdue, row.currency)} vencido`}
                  >
                    {row.onTime > 0 && (
                      <div
                        className="chart-grow-x h-full bg-primary"
                        style={{
                          width: `${100 - (row.overduePct ?? 0)}%`,
                          animationDelay: `${200 + index * 90}ms`,
                        }}
                        title={`Al día: ${formatMoney(row.onTime, row.currency)}`}
                      />
                    )}
                    {row.overdue > 0 && (
                      // El tramo vencido entra después: es el dato que tiene que llamar la atención.
                      <div
                        className="chart-grow-x h-full bg-destructive"
                        style={{
                          width: `${row.overduePct}%`,
                          animationDelay: `${520 + index * 90}ms`,
                        }}
                        title={`Vencido: ${formatMoney(row.overdue, row.currency)}`}
                      />
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Nada pendiente en {row.currency}.</p>
                )}
              </div>

              <div className="flex items-center gap-2.5 sm:justify-end">
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg",
                    row.netThisMonth >= 0
                      ? "bg-success/15 text-success"
                      : "bg-destructive/12 text-destructive"
                  )}
                  aria-hidden="true"
                >
                  {row.netThisMonth >= 0 ? (
                    <TrendingUp className="size-4" />
                  ) : (
                    <TrendingDown className="size-4" />
                  )}
                </span>
                <div>
                  <p className="label-mono text-muted-foreground">Neto del mes</p>
                  <p
                    className={cn(
                      "font-mono text-sm font-semibold tabular-nums",
                      row.netThisMonth < 0 && "text-destructive"
                    )}
                  >
                    {row.netThisMonth > 0 ? "+" : ""}
                    {formatMoney(row.netThisMonth, row.currency)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", className)} aria-hidden="true" />
      {label}
    </span>
  )
}
