import { generateFinanceRecurringRecord, reimbursePartnerPayment } from "@/app/(app)/finanzas/actions"
import {
  FINANCE_EXCHANGE_RATE_LABELS,
  FINANCE_FREQUENCY_LABELS,
  FINANCE_PAYMENT_METHOD_LABELS,
  type FinanceExchangeRateType,
  type FinanceFrequency,
  type FinancePaymentMethodType,
  type SupportedCurrency,
} from "@/lib/constants"
import { formatDateNumeric, formatMoney, todayISO } from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export type RecurringFinanceRow = {
  id: string
  recordType: "income" | "expense"
  concept: string
  category: string
  businessUnitName: string
  clientName: string | null
  total: number
  currency: SupportedCurrency
  frequency: FinanceFrequency
  nextDueDate: string
  exchangeRateType: FinanceExchangeRateType
  active: boolean
}

export type PaymentMethodRow = {
  id: string
  name: string
  methodType: FinancePaymentMethodType
  ownerName: string
  currency: SupportedCurrency
  institution: string | null
  lastFour: string | null
}

export type PartnerAdvanceRow = {
  paymentId: string
  partnerName: string
  amountArs: number
  paidOn: string
  concept: string
}

export type UnitResultRow = {
  id: string
  name: string
  incomeArs: number
  expenseArs: number
}

export function BusinessUnitResults({ rows }: { rows: UnitResultRow[] }) {
  return <Card>
    <CardHeader className="pb-3"><CardTitle className="text-sm">Resultado económico por línea</CardTitle></CardHeader>
    <CardContent>
      <Table><TableHeader><TableRow><TableHead>Línea</TableHead><TableHead className="text-right">Ingresos</TableHead><TableHead className="text-right">Gastos</TableHead><TableHead className="text-right">Resultado</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell className="font-medium">{row.name}</TableCell><TableCell className="text-right font-mono">{formatMoney(row.incomeArs, "ARS")}</TableCell><TableCell className="text-right font-mono">{formatMoney(row.expenseArs, "ARS")}</TableCell><TableCell className="text-right font-mono font-semibold">{formatMoney(row.incomeArs - row.expenseArs, "ARS")}</TableCell></TableRow>)}</TableBody>
      </Table>
    </CardContent>
  </Card>
}

export function PartnerAdvances({ rows }: { rows: PartnerAdvanceRow[] }) {
  return <Card>
    <CardHeader className="pb-3"><CardTitle className="text-sm">Adelantos de socios</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {!rows.length ? <p className="text-sm text-muted-foreground">No hay reintegros pendientes.</p> : rows.map((row) => <div key={row.paymentId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><p className="text-sm font-medium">Operon debe a {row.partnerName}</p><p className="text-xs text-muted-foreground">{row.concept} · {formatDateNumeric(row.paidOn)}</p></div><div className="flex items-center gap-2"><strong className="font-mono text-sm">{formatMoney(row.amountArs, "ARS")}</strong><form action={reimbursePartnerPayment}><input type="hidden" name="financial_payment_id" value={row.paymentId} /><input type="hidden" name="reimbursed_on" value={todayISO()} /><Button type="submit" size="xs" variant="outline">Marcar reintegrado</Button></form></div></div>)}
    </CardContent>
  </Card>
}

export function RecurringItemsTable({ rows }: { rows: RecurringFinanceRow[] }) {
  return <div className="overflow-hidden rounded-xl border bg-background">
    <Table><TableHeader><TableRow><TableHead>Concepto</TableHead><TableHead>Tipo</TableHead><TableHead>Línea</TableHead><TableHead>Importe</TableHead><TableHead>Frecuencia</TableHead><TableHead>Próximo</TableHead><TableHead className="text-right">Acción</TableHead></TableRow></TableHeader>
      <TableBody>{!rows.length ? <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Todavía no hay abonos ni gastos recurrentes.</TableCell></TableRow> : rows.map((row) => <TableRow key={row.id}>
        <TableCell><p className="font-medium">{row.concept}</p><p className="text-xs text-muted-foreground">{row.clientName ?? row.category}</p></TableCell>
        <TableCell><Badge variant={row.recordType === "income" ? "secondary" : "outline"}>{row.recordType === "income" ? "Ingreso" : "Gasto"}</Badge></TableCell>
        <TableCell>{row.businessUnitName}</TableCell>
        <TableCell className="font-mono">{formatMoney(row.total, row.currency)}{row.currency === "USD" && <p className="text-xs font-sans text-muted-foreground">{FINANCE_EXCHANGE_RATE_LABELS[row.exchangeRateType]}</p>}</TableCell>
        <TableCell>{FINANCE_FREQUENCY_LABELS[row.frequency]}</TableCell>
        <TableCell>{formatDateNumeric(row.nextDueDate)}</TableCell>
        <TableCell className="text-right"><form action={generateFinanceRecurringRecord}><input type="hidden" name="recurring_item_id" value={row.id} /><Button type="submit" size="xs" disabled={!row.active}>Generar movimiento</Button></form></TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </div>
}

export function PaymentMethodsGrid({ rows }: { rows: PaymentMethodRow[] }) {
  if (!rows.length) return <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Todavía no hay medios de pago.</div>
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rows.map((row) => <Card key={row.id}><CardContent className="p-4"><div className="flex items-center justify-between gap-3"><p className="font-medium">{row.name}</p><Badge variant="outline">{row.currency}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{FINANCE_PAYMENT_METHOD_LABELS[row.methodType]}{row.institution ? ` · ${row.institution}` : ""}{row.lastFour ? ` · •••• ${row.lastFour}` : ""}</p><p className="mt-2 text-xs text-muted-foreground">Titular: {row.ownerName}</p></CardContent></Card>)}</div>
}
