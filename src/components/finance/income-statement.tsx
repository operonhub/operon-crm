import { ArrowDown, ArrowUp, Equal, TrendingDown, TrendingUp } from "lucide-react"
import type { ManagementSummary } from "@/lib/finance"
import { formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export type IncomeStatementLine = {
  id: string
  concept: string
  category: string
  clientName: string | null
  amountArs: number
  kind: "income" | "variable" | "fixed"
}

export function IncomeStatement({
  summary,
  lines,
  monthLabel,
  unitName,
}: {
  summary: ManagementSummary
  lines: IncomeStatementLine[]
  monthLabel: string
  unitName: string
}) {
  const resultPositive = summary.economicNetArs >= 0
  const maxValue = Math.max(
    summary.economicIncomeArs,
    summary.economicVariableExpenseArs,
    summary.economicFixedExpenseArs,
    Math.abs(summary.economicNetArs),
    1
  )
  const rows = [
    { label: "Ingresos", value: summary.economicIncomeArs, tone: "income" as const, icon: ArrowUp },
    { label: "Costos variables", value: -summary.economicVariableExpenseArs, tone: "expense" as const, icon: ArrowDown },
    { label: "Margen de contribución", value: summary.contributionMarginArs, tone: "subtotal" as const, icon: Equal },
    { label: "Gastos fijos", value: -summary.economicFixedExpenseArs, tone: "expense" as const, icon: ArrowDown },
  ]

  return <Card className="overflow-hidden">
    <CardHeader className="border-b bg-muted/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="label-mono text-primary">Estado de resultados económico</p><CardTitle className="mt-1 text-lg">{unitName} · {monthLabel}</CardTitle></div>
        <div className={cn("rounded-xl px-4 py-2 text-right", resultPositive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
          <p className="text-xs font-medium">Resultado del mes</p>
          <p className="font-mono text-xl font-semibold">{formatMoney(summary.economicNetArs, "ARS")}</p>
        </div>
      </div>
    </CardHeader>
    <CardContent className="space-y-6 p-4 sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,.85fr)]">
        <div className="space-y-2">
          {rows.map((row) => <StatementRow key={row.label} {...row} maxValue={maxValue} />)}
          <div className={cn("mt-3 flex items-center justify-between gap-4 rounded-xl border-2 p-4", resultPositive ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5")}>
            <div className="flex items-center gap-3">{resultPositive ? <TrendingUp className="size-5 text-success" /> : <TrendingDown className="size-5 text-destructive" />}<div><p className="font-semibold">Resultado operativo</p><p className="text-xs text-muted-foreground">Ingresos menos costos variables y gastos fijos</p></div></div>
            <strong className={cn("font-mono text-lg", resultPositive ? "text-success" : "text-destructive")}>{formatMoney(summary.economicNetArs, "ARS")}</strong>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm font-semibold">Composición de cada $100 ingresados</p>
          <p className="mt-1 text-xs text-muted-foreground">Ayuda a ver cuánto absorbe la operación.</p>
          <div className="mt-5 space-y-4">
            <ShareBar label="Costos variables" value={summary.economicVariableExpenseArs} income={summary.economicIncomeArs} className="bg-warning" />
            <ShareBar label="Gastos fijos" value={summary.economicFixedExpenseArs} income={summary.economicIncomeArs} className="bg-destructive/70" />
            <ShareBar label="Resultado" value={Math.max(0, summary.economicNetArs)} income={summary.economicIncomeArs} className="bg-success" />
          </div>
        </div>
      </div>

      <details className="group rounded-xl border" open>
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold">Ver movimientos que forman este resultado <span className="ml-1 text-muted-foreground">({lines.length})</span></summary>
        <div className="border-t">
          {!lines.length ? <p className="p-6 text-center text-sm text-muted-foreground">No hay movimientos devengados en este mes y negocio.</p> : <div className="divide-y">{lines.map((line) => <div key={line.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="text-sm font-medium">{line.concept}</p><p className="text-xs text-muted-foreground">{line.clientName ?? line.category} · {line.kind === "income" ? "Ingreso" : line.kind === "variable" ? "Costo variable" : "Gasto fijo"}</p></div><p className={cn("font-mono text-sm", line.kind === "income" ? "text-success" : "text-destructive")}>{line.kind === "income" ? "+" : "−"}{formatMoney(line.amountArs, "ARS")}</p></div>)}</div>}
        </div>
      </details>
    </CardContent>
  </Card>
}

function StatementRow({ label, value, tone, icon: Icon, maxValue }: { label: string; value: number; tone: "income" | "expense" | "subtotal"; icon: typeof ArrowUp; maxValue: number }) {
  const width = `${Math.max(2, Math.min(100, Math.abs(value) / maxValue * 100))}%`
  return <div className={cn("rounded-xl border p-3", tone === "subtotal" && "bg-muted/35")}><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-medium"><Icon className={cn("size-4", tone === "income" ? "text-success" : tone === "expense" ? "text-destructive" : "text-primary")} />{label}</span><span className="font-mono text-sm font-semibold">{formatMoney(value, "ARS")}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", tone === "income" ? "bg-success" : tone === "expense" ? "bg-destructive/70" : "bg-primary")} style={{ width }} /></div></div>
}

function ShareBar({ label, value, income, className }: { label: string; value: number; income: number; className: string }) {
  const percentage = income > 0 ? Math.max(0, Math.min(100, value / income * 100)) : 0
  return <div><div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span>{label}</span><span className="font-mono">{percentage.toFixed(1)}%</span></div><div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", className)} style={{ width: `${percentage}%` }} /></div><p className="mt-1 text-right font-mono text-xs text-muted-foreground">{formatMoney(value, "ARS")}</p></div>
}
