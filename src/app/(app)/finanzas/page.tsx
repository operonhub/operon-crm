import { AlarmClock, ArrowDownLeft, ArrowUpRight, Hourglass, WalletCards } from "lucide-react"
import { getSessionUser } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { KpiCard } from "@/components/shell/kpi-card"
import { MoneyPair } from "@/components/shell/money-pair"
import { ReceivableHealthCard } from "@/components/finance/receivable-health"
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
  hasMoney,
  receivableHealth,
  summarizeFinances,
} from "@/lib/finance"
import { todayISO } from "@/lib/format"
import type {
  FinancialRecordType,
  SupportedCurrency,
} from "@/lib/constants"
import { PageTransition } from "@/components/shell/page-transition"

export default async function FinanzasPage() {
  const [supabase, user] = await Promise.all([createClient(), getSessionUser()])
  // El rol va en el mismo lote: antes se pedía después, en un viaje aparte.
  const [recordsRes, clientsRes, projectsRes, currentProfileRes] = await Promise.all([
    supabase
      .from("financial_records")
      .select(
        `id, record_type, concept, currency, total_amount, paid_amount, due_date,
         paid_at, canceled_at, cancel_reason, client_id, project_id, created_at, notes,
         client:clients(id, organization:organizations(name)),
         project:projects(id, name),
         payments:financial_payments(id, amount, paid_on, note, created_at, actor:profiles!financial_payments_created_by_fkey(full_name)),
         history:financial_record_history(id, change_type, changed_at, note, actor:profiles!financial_record_history_changed_by_fkey(full_name))`
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("clients")
      .select("id, organization:organizations(name)")
      .order("created_at", { ascending: false }),
    supabase.from("projects").select("id, name").order("name"),
    user
      ? supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
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
    notes: record.notes,
    canceledAt: record.canceled_at,
    cancelReason: record.cancel_reason,
    payments: [...(record.payments ?? [])]
      .sort((a, b) => b.paid_on.localeCompare(a.paid_on))
      .map((payment) => ({
        id: payment.id,
        amount: Number(payment.amount),
        paidOn: payment.paid_on,
        note: payment.note,
        createdAt: payment.created_at,
        actor: payment.actor?.full_name ?? null,
      })),
    history: [...(record.history ?? [])]
      .sort((a, b) => b.changed_at.localeCompare(a.changed_at))
      .map((item) => ({
        id: item.id,
        changeType: item.change_type,
        changedAt: item.changed_at,
        note: item.note,
        actor: item.actor?.full_name ?? null,
      })),
  }))

  const clients: FinanceOption[] = (clientsRes.data ?? []).map((client) => ({
    id: client.id,
    name: client.organization?.name ?? "Cliente sin organización",
  }))
  const projects: FinanceOption[] = projectsRes.data ?? []
  const isAdmin = currentProfileRes.data?.role === "admin"

  return (
    <PageTransition>
    <>
      <PageHeader
        title="Finanzas"
        description="Control operativo de cobros y gastos, separado por moneda"
      >
        {isAdmin && <NewFinancialRecordDialog clients={clients} projects={projects} />}
      </PageHeader>

      <div className="space-y-6 p-4 sm:p-6">
        {recordsRes.error ? (
          <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            No se pudo leer Finanzas. Aplicá la migración operativa antes de usar este módulo.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                index={0}
                label="Cobrado este mes"
                tone="success"
                icon={<ArrowDownLeft />}
                display={<MoneyPair totals={summary.collectedThisMonth} />}
              />
              <KpiCard
                index={1}
                label="Pendiente"
                tone="primary"
                icon={<Hourglass />}
                display={<MoneyPair totals={summary.pending} />}
              />
              <KpiCard
                index={2}
                label="Vencido"
                tone={hasMoney(summary.overdue) ? "danger" : "default"}
                icon={<AlarmClock />}
                display={<MoneyPair totals={summary.overdue} />}
                hint={hasMoney(summary.overdue) ? "Requiere seguimiento" : "Todo al día"}
              />
              <KpiCard
                index={3}
                label="Gastos este mes"
                icon={<ArrowUpRight />}
                display={<MoneyPair totals={summary.expensesThisMonth} />}
              />
            </div>

            <ReceivableHealthCard
              rows={[receivableHealth(summary, "ARS"), receivableHealth(summary, "USD")]}
            />

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
              <FinanceRecords records={records} clients={clients} projects={projects} isAdmin={isAdmin} />
            </section>
          </>
        )}
      </div>
    </>
    </PageTransition>
  )
}
