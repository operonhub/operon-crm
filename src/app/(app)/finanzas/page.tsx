import { ArrowDownLeft, ArrowUpRight, Landmark, Scale, WalletCards } from "lucide-react"
import { getSessionUser } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { KpiCard } from "@/components/shell/kpi-card"
import {
  NewFinancialRecordDialog,
  type FinanceFormOptions,
} from "@/components/finance/new-record-dialog"
import {
  NewPaymentMethodDialog,
  NewRecurringItemDialog,
} from "@/components/finance/finance-management-dialogs"
import {
  BusinessUnitResults,
  PartnerAdvances,
  PaymentMethodsGrid,
  RecurringItemsTable,
  type PartnerAdvanceRow,
  type PaymentMethodRow,
  type RecurringFinanceRow,
  type UnitResultRow,
} from "@/components/finance/finance-management"
import { FinanceRecords, type FinanceRow } from "@/components/finance/finance-records"
import {
  economicAmountInMonth,
  financialBalance,
  financialStatus,
  summarizeManagement,
} from "@/lib/finance"
import { formatMoney, todayISO } from "@/lib/format"
import type {
  FinanceExchangeRateType,
  FinanceFrequency,
  FinancePaymentMethodType,
  FinancialRecordType,
  SupportedCurrency,
} from "@/lib/constants"
import { PageTransition } from "@/components/shell/page-transition"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default async function FinanzasPage() {
  const [supabase, user] = await Promise.all([createClient(), getSessionUser()])
  const [recordsRes, clientsRes, projectsRes, contactsRes, unitsRes, methodsRes, recurringRes, profilesRes, currentProfileRes] = await Promise.all([
    supabase.from("financial_records").select(`
      id, record_type, concept, category, currency, total_amount, amount_ars,
      exchange_rate_type, exchange_rate, paid_amount, due_date, accrual_date,
      recognition_months, paid_at, canceled_at, cancel_reason, business_unit_id,
      client_id, contact_id, project_id, default_payment_method_id,
      default_paid_by_profile_id, created_at, notes,
      client:clients(id, organization:organizations(name)),
      project:projects(id, name),
      payments:financial_payments(
        id, amount, amount_ars, paid_on, note, created_at, paid_by_profile_id,
        actor:profiles!financial_payments_created_by_fkey(full_name),
        payer:profiles!financial_payments_paid_by_profile_id_fkey(full_name),
        method:finance_payment_methods(name),
        reimbursements:finance_partner_reimbursements(id)
      ),
      history:financial_record_history(id, change_type, changed_at, note, actor:profiles!financial_record_history_changed_by_fkey(full_name))
    `).order("created_at", { ascending: false }),
    supabase.from("clients").select("id, organization:organizations(name)").order("created_at", { ascending: false }),
    supabase.from("projects").select("id, name").order("name"),
    supabase.from("contacts").select("id, full_name, phone").order("full_name"),
    supabase.from("business_units").select("id, name, active").order("name"),
    supabase.from("finance_payment_methods").select("id, name, method_type, owner_type, owner_profile_id, owner_label, currency, institution, last_four, active").order("name"),
    supabase.from("finance_recurring_items").select("*").order("next_due_date"),
    supabase.from("profiles").select("id, full_name, role").order("full_name"),
    user ? supabase.from("profiles").select("role").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
  ])

  const today = todayISO()
  const month = today.slice(0, 7)
  const units = unitsRes.data ?? []
  const contacts = contactsRes.data ?? []
  const paymentMethods = methodsRes.data ?? []
  const profiles = profilesRes.data ?? []
  const unitNames = new Map(units.map((item) => [item.id, item.name]))
  const contactMap = new Map(contacts.map((item) => [item.id, item]))
  const profileNames = new Map(profiles.map((item) => [item.id, item.full_name]))

  const raw = (recordsRes.data ?? []).map((record) => ({
    ...record,
    record_type: record.record_type as FinancialRecordType,
    currency: record.currency as SupportedCurrency,
  }))
  const records: FinanceRow[] = raw.map((record) => {
    const contact = record.contact_id ? contactMap.get(record.contact_id) : null
    return {
      id: record.id,
      recordType: record.record_type,
      concept: record.concept,
      category: record.category,
      currency: record.currency,
      total: Number(record.total_amount),
      amountArs: record.amount_ars == null ? null : Number(record.amount_ars),
      exchangeRateType: record.exchange_rate_type as FinanceExchangeRateType,
      exchangeRate: record.exchange_rate == null ? null : Number(record.exchange_rate),
      paid: Number(record.paid_amount),
      balance: financialBalance(record),
      accrualDate: record.accrual_date,
      recognitionMonths: record.recognition_months,
      dueDate: record.due_date,
      paidAt: record.paid_at,
      status: financialStatus(record, today),
      businessUnitId: record.business_unit_id,
      businessUnitName: unitNames.get(record.business_unit_id) ?? "General",
      clientId: record.client_id,
      clientName: record.client?.organization?.name ?? null,
      contactId: record.contact_id,
      contactName: contact?.full_name ?? null,
      contactPhone: contact?.phone ?? null,
      projectId: record.project_id,
      projectName: record.project?.name ?? null,
      defaultPaymentMethodId: record.default_payment_method_id,
      defaultPaidByProfileId: record.default_paid_by_profile_id,
      createdAt: record.created_at,
      notes: record.notes,
      canceledAt: record.canceled_at,
      cancelReason: record.cancel_reason,
      payments: [...(record.payments ?? [])].sort((a, b) => b.paid_on.localeCompare(a.paid_on)).map((payment) => ({
        id: payment.id,
        amount: Number(payment.amount),
        paidOn: payment.paid_on,
        note: payment.note,
        actor: payment.actor?.full_name ?? null,
        methodName: payment.method?.name ?? null,
        paidByName: payment.payer?.full_name ?? null,
      })),
      history: [...(record.history ?? [])].sort((a, b) => b.changed_at.localeCompare(a.changed_at)).map((item) => ({
        id: item.id,
        changeType: item.change_type,
        changedAt: item.changed_at,
        note: item.note,
        actor: item.actor?.full_name ?? null,
      })),
    }
  })

  const managementRecords = raw.map((record) => ({
    record_type: record.record_type,
    canceled_at: record.canceled_at,
    amount_ars: record.amount_ars == null ? null : Number(record.amount_ars),
    accrual_date: record.accrual_date,
    recognition_months: record.recognition_months,
  }))
  const managementPayments = raw.flatMap((record) => (record.payments ?? []).map((payment) => ({
    record_type: record.record_type,
    amount_ars: payment.amount_ars == null ? null : Number(payment.amount_ars),
    paid_on: payment.paid_on,
  })))
  const management = summarizeManagement(managementRecords, managementPayments, month)

  const clients = (clientsRes.data ?? []).map((client) => ({ id: client.id, name: client.organization?.name ?? "Cliente sin organización" }))
  const options: FinanceFormOptions = {
    businessUnits: units.filter((item) => item.active).map((item) => ({ id: item.id, name: item.name })),
    clients,
    contacts: contacts.map((item) => ({ id: item.id, name: item.full_name, phone: item.phone })),
    projects: projectsRes.data ?? [],
    paymentMethods: paymentMethods.filter((item) => item.active).map((item) => ({ id: item.id, name: item.name, ownerProfileId: item.owner_profile_id, currency: item.currency })),
    profiles: profiles.map((item) => ({ id: item.id, name: item.full_name })),
  }
  const recurring: RecurringFinanceRow[] = (recurringRes.data ?? []).map((item) => ({
    id: item.id,
    recordType: item.record_type as "income" | "expense",
    concept: item.concept,
    category: item.category,
    businessUnitName: unitNames.get(item.business_unit_id) ?? "General",
    clientName: clients.find((client) => client.id === item.client_id)?.name ?? null,
    total: Number(item.total_amount),
    currency: item.currency as SupportedCurrency,
    frequency: item.frequency as FinanceFrequency,
    nextDueDate: item.next_due_date,
    exchangeRateType: item.exchange_rate_type as FinanceExchangeRateType,
    active: item.active,
  }))
  const methods: PaymentMethodRow[] = paymentMethods.map((item) => ({
    id: item.id,
    name: item.name,
    methodType: item.method_type as FinancePaymentMethodType,
    ownerName: item.owner_type === "operon" ? "Operon" : profileNames.get(item.owner_profile_id ?? "") ?? item.owner_label ?? "Socio",
    currency: item.currency as SupportedCurrency,
    institution: item.institution,
    lastFour: item.last_four,
  }))
  const partnerAdvances: PartnerAdvanceRow[] = raw.flatMap((record) => record.record_type !== "expense" ? [] : (record.payments ?? []).flatMap((payment) => {
    if (!payment.paid_by_profile_id || payment.amount_ars == null || payment.reimbursements) return []
    return [{ paymentId: payment.id, partnerName: profileNames.get(payment.paid_by_profile_id) ?? "Socio", amountArs: Number(payment.amount_ars), paidOn: payment.paid_on, concept: record.concept }]
  }))
  const unitResults: UnitResultRow[] = units.map((unit) => {
    let incomeArs = 0
    let expenseArs = 0
    for (const record of raw) {
      if (record.business_unit_id !== unit.id) continue
      const value = economicAmountInMonth({
        record_type: record.record_type,
        canceled_at: record.canceled_at,
        amount_ars: record.amount_ars == null ? null : Number(record.amount_ars),
        accrual_date: record.accrual_date,
        recognition_months: record.recognition_months,
      }, month)
      if (record.record_type === "income") incomeArs += value
      else expenseArs += value
    }
    return { id: unit.id, name: unit.name, incomeArs, expenseArs }
  })
  const isAdmin = currentProfileRes.data?.role === "admin"
  const migrationError = [recordsRes, unitsRes, methodsRes, recurringRes].find((result) => result.error)?.error

  return <PageTransition><>
    <PageHeader title="Finanzas" description="Caja real, resultado económico, abonos y gastos por línea de negocio">
      {isAdmin && <div className="flex flex-wrap gap-2"><NewFinancialRecordDialog options={options} /><NewRecurringItemDialog options={options} /><NewPaymentMethodDialog profiles={options.profiles} /></div>}
    </PageHeader>
    <div className="space-y-6 p-4 sm:p-6">
      {migrationError ? <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">El código de Finanzas está listo, pero la base todavía no tiene aplicada su migración. No se modificó ningún proyecto de Supabase.</div> : <>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
          <KpiCard index={0} label="Cobros de caja" tone="success" icon={<ArrowDownLeft />} display={<strong className="font-mono text-xl">{formatMoney(management.cashIncomeArs, "ARS")}</strong>} hint="Pagos reales del mes" />
          <KpiCard index={1} label="Pagos de caja" icon={<ArrowUpRight />} display={<strong className="font-mono text-xl">{formatMoney(management.cashExpenseArs, "ARS")}</strong>} hint="Salidas reales del mes" />
          <KpiCard index={2} label="Flujo neto" tone={management.cashNetArs < 0 ? "danger" : "primary"} icon={<Landmark />} display={<strong className="font-mono text-xl">{formatMoney(management.cashNetArs, "ARS")}</strong>} hint="Cobros menos pagos" />
          <KpiCard index={3} label="Resultado económico" tone={management.economicNetArs < 0 ? "danger" : "success"} icon={<Scale />} display={<strong className="font-mono text-xl">{formatMoney(management.economicNetArs, "ARS")}</strong>} hint="Devengado del mes" />
        </div>
        {management.unconvertedItems > 0 && <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">Hay {management.unconvertedItems} registros USD históricos sin cotización; se excluyen del consolidado en pesos hasta editarlos.</p>}
        <div className="grid gap-4 xl:grid-cols-2"><BusinessUnitResults rows={unitResults} /><PartnerAdvances rows={partnerAdvances} /></div>
        <Tabs defaultValue="movements">
          <TabsList><TabsTrigger value="movements">Movimientos</TabsTrigger><TabsTrigger value="recurring">Recurrentes</TabsTrigger><TabsTrigger value="methods">Medios de pago</TabsTrigger></TabsList>
          <TabsContent value="movements" className="space-y-3"><div className="flex items-center gap-2"><WalletCards className="size-4 text-muted-foreground" /><h2 className="font-heading text-sm font-semibold">Cuentas y movimientos</h2><span className="font-mono text-xs text-muted-foreground">{records.length}</span></div><FinanceRecords records={records} options={options} isAdmin={isAdmin} /></TabsContent>
          <TabsContent value="recurring"><RecurringItemsTable rows={recurring} /></TabsContent>
          <TabsContent value="methods"><PaymentMethodsGrid rows={methods} /></TabsContent>
        </Tabs>
      </>}
    </div>
  </></PageTransition>
}
