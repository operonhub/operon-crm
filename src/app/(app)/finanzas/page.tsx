import { WalletCards } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import {
  NewFinancialRecordDialog,
  type FinanceOption,
} from "@/components/finance/new-record-dialog"
import {
  FinanceRecords,
  type FinanceRow,
} from "@/components/finance/finance-records"
import {
  financialBalance,
  financialStatus,
  summarizeFinances,
  type MoneyByCurrency,
} from "@/lib/finance"
import { formatMoney, todayISO } from "@/lib/format"
import type {
  FinancialRecordType,
  SupportedCurrency,
} from "@/lib/constants"

export default async function FinanzasPage() {
  const supabase = await createClient()
  const [recordsRes, clientsRes, projectsRes] = await Promise.all([
    supabase
      .from("financial_records")
      .select(
        `id, record_type, concept, currency, total_amount, paid_amount, due_date,
         paid_at, canceled_at, client_id, project_id, created_at,
         client:clients(id, organization:organizations(name)),
         project:projects(id, name)`
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("clients")
      .select("id, organization:organizations(name)")
      .order("created_at", { ascending: false }),
    supabase.from("projects").select("id, name").order("name"),
  ])

  const today = todayISO()
  const raw = (recordsRes.data ?? []).map((record) => ({
    ...record,
    record_type: record.record_type as FinancialRecordType,
    currency: record.currency as SupportedCurrency,
  }))
  const summary = summarizeFinances(raw, today)
  const records: FinanceRow[] = raw.map((record) => ({
    id: record.id,
    recordType: record.record_type,
    concept: record.concept,
    currency: record.currency,
    total: Number(record.total_amount),
    paid: Number(record.paid_amount),
    balance: financialBalance(record),
    dueDate: record.due_date,
    paidAt: record.paid_at,
    status: financialStatus(record, today),
    clientId: record.client_id,
    clientName: record.client?.organization?.name ?? null,
    projectId: record.project_id,
    projectName: record.project?.name ?? null,
    createdAt: record.created_at,
  }))

  const clients: FinanceOption[] = (clientsRes.data ?? []).map((client) => ({
    id: client.id,
    name: client.organization?.name ?? "Cliente sin organización",
  }))
  const projects: FinanceOption[] = projectsRes.data ?? []

  return (
    <>
      <PageHeader
        title="Finanzas"
        description="Control operativo de cobros y gastos, separado por moneda"
      >
        <NewFinancialRecordDialog clients={clients} projects={projects} />
      </PageHeader>

      <div className="space-y-6 p-4 sm:p-6">
        {recordsRes.error ? (
          <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            No se pudo leer Finanzas. Aplicá la migración operativa antes de usar este módulo.
          </div>
        ) : (
          <>
            <Card className="gap-0 overflow-hidden py-0">
              <div className="grid grid-cols-2 lg:grid-cols-4">
                <SummaryCell label="Cobrado este mes" totals={summary.collectedThisMonth} />
                <SummaryCell label="Pendiente" totals={summary.pending} border />
                <SummaryCell label="Vencido" totals={summary.overdue} border danger />
                <SummaryCell label="Gastos este mes" totals={summary.expensesThisMonth} border />
              </div>
            </Card>

            <section aria-labelledby="receivables-title" className="space-y-3">
              <div className="flex items-center gap-2">
                <WalletCards className="h-4 w-4 text-muted-foreground" />
                <h2 id="receivables-title" className="font-heading text-sm font-semibold">
                  Cuentas y movimientos
                </h2>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {records.length}
                </span>
              </div>
              <FinanceRecords records={records} />
            </section>
          </>
        )}
      </div>
    </>
  )
}
function SummaryCell({
  label,
  totals,
  border = false,
  danger = false,
}: {
  label: string
  totals: MoneyByCurrency
  border?: boolean
  danger?: boolean
}) {
  return (
    <div className={`${border ? "border-l" : ""} border-b p-4 last:border-b-0 lg:border-b-0`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className={`mt-2 space-y-0.5 font-mono text-sm font-semibold tabular-nums ${danger && (totals.ARS > 0 || totals.USD > 0) ? "text-destructive" : ""}`}>
        <p>{formatMoney(totals.ARS, "ARS")}</p>
        <p>{formatMoney(totals.USD, "USD")}</p>
      </div>
    </div>
  )
}
