import Link from "next/link"
import { ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Landmark, Scale, SlidersHorizontal, WalletCards } from "lucide-react"
import { getSessionUser } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { KpiCard } from "@/components/shell/kpi-card"
import { NewFinancialRecordDialog, type FinanceFormOptions } from "@/components/finance/new-record-dialog"
import { NewPaymentMethodDialog, NewRecurringItemDialog } from "@/components/finance/finance-management-dialogs"
import { BusinessUnitResults, PartnerAdvances, PaymentMethodsGrid, RecurringItemsTable, type PartnerAdvanceRow, type PaymentMethodRow, type RecurringFinanceRow, type UnitResultRow } from "@/components/finance/finance-management"
import { IncomeStatement, type IncomeStatementLine } from "@/components/finance/income-statement"
import { FinanceRecords, type FinanceRow } from "@/components/finance/finance-records"
import { economicAmountInMonth, financialBalance, financialStatus, summarizeManagement } from "@/lib/finance"
import { formatMoney, todayISO } from "@/lib/format"
import type { FinanceExchangeRateType, FinanceFrequency, FinancePaymentMethodType, FinancialRecordType, SupportedCurrency } from "@/lib/constants"
import { PageTransition } from "@/components/shell/page-transition"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default async function FinanzasPage({ searchParams }: { searchParams: Promise<{ month?: string; unit?: string }> }) {
  const params = await searchParams
  const [supabase, user] = await Promise.all([createClient(), getSessionUser()])
  const [recordsRes, clientsRes, projectsRes, contactsRes, unitsRes, methodsRes, recurringRes, profilesRes, currentProfileRes] = await Promise.all([
    supabase.from("financial_records").select(`
      id, record_type, concept, category, expense_kind, currency, total_amount, amount_ars,
      exchange_rate_type, exchange_rate, paid_amount, due_date, accrual_date,
      recognition_months, paid_at, canceled_at, cancel_reason, business_unit_id,
      client_id, contact_id, project_id, default_payment_method_id,
      default_paid_by_profile_id, created_at, notes,
      client:clients(id, organization:organizations(name)), project:projects(id, name),
      payments:financial_payments(id, amount, amount_ars, paid_on, note, created_at, paid_by_profile_id,
        actor:profiles!financial_payments_created_by_fkey(full_name), payer:profiles!financial_payments_paid_by_profile_id_fkey(full_name),
        method:finance_payment_methods(name), reimbursements:finance_partner_reimbursements(id)),
      history:financial_record_history(id, change_type, changed_at, note, actor:profiles!financial_record_history_changed_by_fkey(full_name))
    `).order("created_at", { ascending: false }),
    supabase.from("clients").select("id, business_unit_id, organization:organizations(name)").order("created_at", { ascending: false }),
    supabase.from("projects").select("id, name").order("name"),
    supabase.from("contacts").select("id, full_name, phone").order("full_name"),
    supabase.from("business_units").select("id, name, code, active").order("name"),
    supabase.from("finance_payment_methods").select("id, name, method_type, owner_type, owner_profile_id, owner_label, currency, institution, last_four, active").order("name"),
    supabase.from("finance_recurring_items").select("*").order("next_due_date"),
    supabase.from("profiles").select("id, full_name, role").order("full_name"),
    user ? supabase.from("profiles").select("role").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
  ])

  const today = todayISO()
  const currentMonth = today.slice(0, 7)
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month ?? "") ? params.month! : currentMonth
  const units = unitsRes.data ?? []
  const selectedUnitId = units.some((unit) => unit.id === params.unit) ? params.unit! : "all"
  const selectedUnitName = selectedUnitId === "all" ? "Todo Operon" : units.find((unit) => unit.id === selectedUnitId)?.name ?? "Todo Operon"
  const contacts = contactsRes.data ?? []
  const paymentMethods = methodsRes.data ?? []
  const profiles = profilesRes.data ?? []
  const unitNames = new Map(units.map((item) => [item.id, item.name]))
  const contactMap = new Map(contacts.map((item) => [item.id, item]))
  const profileNames = new Map(profiles.map((item) => [item.id, item.full_name]))

  const raw = (recordsRes.data ?? []).map((record) => ({ ...record, record_type: record.record_type as FinancialRecordType, currency: record.currency as SupportedCurrency, expense_kind: record.expense_kind as "fixed" | "variable" | null }))
  const selectedRaw = selectedUnitId === "all" ? raw : raw.filter((record) => record.business_unit_id === selectedUnitId)
  const records: FinanceRow[] = selectedRaw.map((record) => {
    const contact = record.contact_id ? contactMap.get(record.contact_id) : null
    return {
      id: record.id, recordType: record.record_type, concept: record.concept, category: record.category, expenseKind: record.expense_kind,
      currency: record.currency, total: Number(record.total_amount), amountArs: record.amount_ars == null ? null : Number(record.amount_ars),
      exchangeRateType: record.exchange_rate_type as FinanceExchangeRateType, exchangeRate: record.exchange_rate == null ? null : Number(record.exchange_rate),
      paid: Number(record.paid_amount), balance: financialBalance(record), accrualDate: record.accrual_date, recognitionMonths: record.recognition_months,
      dueDate: record.due_date, paidAt: record.paid_at, status: financialStatus(record, today), businessUnitId: record.business_unit_id,
      businessUnitName: unitNames.get(record.business_unit_id) ?? "General", clientId: record.client_id, clientName: record.client?.organization?.name ?? null,
      contactId: record.contact_id, contactName: contact?.full_name ?? null, contactPhone: contact?.phone ?? null, projectId: record.project_id,
      projectName: record.project?.name ?? null, defaultPaymentMethodId: record.default_payment_method_id, defaultPaidByProfileId: record.default_paid_by_profile_id,
      createdAt: record.created_at, notes: record.notes, canceledAt: record.canceled_at, cancelReason: record.cancel_reason,
      payments: [...(record.payments ?? [])].sort((a, b) => b.paid_on.localeCompare(a.paid_on)).map((payment) => ({ id: payment.id, amount: Number(payment.amount), paidOn: payment.paid_on, note: payment.note, actor: payment.actor?.full_name ?? null, methodName: payment.method?.name ?? null, paidByName: payment.payer?.full_name ?? null })),
      history: [...(record.history ?? [])].sort((a, b) => b.changed_at.localeCompare(a.changed_at)).map((item) => ({ id: item.id, changeType: item.change_type, changedAt: item.changed_at, note: item.note, actor: item.actor?.full_name ?? null })),
    }
  })

  const managementRecords = selectedRaw.map((record) => ({ record_type: record.record_type, expense_kind: record.expense_kind, canceled_at: record.canceled_at, amount_ars: record.amount_ars == null ? null : Number(record.amount_ars), accrual_date: record.accrual_date, recognition_months: record.recognition_months }))
  const managementPayments = selectedRaw.flatMap((record) => (record.payments ?? []).map((payment) => ({ record_type: record.record_type, amount_ars: payment.amount_ars == null ? null : Number(payment.amount_ars), paid_on: payment.paid_on })))
  const management = summarizeManagement(managementRecords, managementPayments, month)

  const clients = (clientsRes.data ?? []).map((client) => ({ id: client.id, name: client.organization?.name ?? "Cliente sin organización", businessUnitId: client.business_unit_id }))
  const options: FinanceFormOptions = {
    businessUnits: units.filter((item) => item.active).map((item) => ({ id: item.id, name: item.name, code: item.code })), clients,
    contacts: contacts.map((item) => ({ id: item.id, name: item.full_name, phone: item.phone })), projects: projectsRes.data ?? [],
    paymentMethods: paymentMethods.filter((item) => item.active).map((item) => ({ id: item.id, name: methodLabel(item, profileNames), ownerProfileId: item.owner_profile_id, currency: item.currency })),
    profiles: profiles.map((item) => ({ id: item.id, name: item.full_name })),
  }
  const methodLabels = new Map(paymentMethods.map((item) => [item.id, methodLabel(item, profileNames)]))
  const recurring: RecurringFinanceRow[] = (recurringRes.data ?? []).filter((item) => selectedUnitId === "all" || item.business_unit_id === selectedUnitId).map((item) => ({ id: item.id, recordType: item.record_type as "income" | "expense", concept: item.concept, category: item.category, businessUnitName: unitNames.get(item.business_unit_id) ?? "General", clientName: clients.find((client) => client.id === item.client_id)?.name ?? null, total: Number(item.total_amount), currency: item.currency as SupportedCurrency, frequency: item.frequency as FinanceFrequency, nextDueDate: item.next_due_date, exchangeRateType: item.exchange_rate_type as FinanceExchangeRateType, active: item.active, autoPaid: item.auto_paid, paymentMethodName: methodLabels.get(item.default_payment_method_id ?? "") ?? null, due: item.next_due_date <= today }))
  const methods: PaymentMethodRow[] = paymentMethods.map((item) => ({ id: item.id, name: item.name, methodType: item.method_type as FinancePaymentMethodType, ownerName: item.owner_type === "operon" ? "Operon" : profileNames.get(item.owner_profile_id ?? "") ?? item.owner_label ?? "Socio", currency: item.currency as SupportedCurrency, institution: item.institution, lastFour: item.last_four }))
  const partnerAdvances: PartnerAdvanceRow[] = selectedRaw.flatMap((record) => record.record_type !== "expense" ? [] : (record.payments ?? []).flatMap((payment) => !payment.paid_by_profile_id || payment.amount_ars == null || payment.reimbursements ? [] : [{ paymentId: payment.id, partnerName: profileNames.get(payment.paid_by_profile_id) ?? "Socio", amountArs: Number(payment.amount_ars), paidOn: payment.paid_on, concept: record.concept }]))
  const unitResults: UnitResultRow[] = units.map((unit) => {
    let incomeArs = 0
    let expenseArs = 0
    for (const record of raw) {
      if (record.business_unit_id !== unit.id) continue
      const value = economicAmountInMonth(toManagementRecord(record), month)
      if (record.record_type === "income") incomeArs += value
      else expenseArs += value
    }
    return { id: unit.id, name: unit.name, incomeArs, expenseArs }
  })
  const statementLines: IncomeStatementLine[] = selectedRaw.flatMap((record) => {
    const value = economicAmountInMonth(toManagementRecord(record), month)
    if (!value) return []
    return [{ id: record.id, concept: record.concept, category: record.category, clientName: record.client?.organization?.name ?? null, amountArs: value, kind: record.record_type === "income" ? "income" as const : record.expense_kind === "variable" ? "variable" as const : "fixed" as const }]
  })
  const isAdmin = currentProfileRes.data?.role === "admin"
  const isMember = Boolean(currentProfileRes.data)
  const migrationError = [recordsRes, clientsRes, unitsRes, methodsRes, recurringRes].find((result) => result.error)?.error
  const monthLabel = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`))
  const previousMonth = shiftMonth(month, -1)
  const nextMonth = shiftMonth(month, 1)
  const unitQuery = selectedUnitId === "all" ? "" : `&unit=${selectedUnitId}`

  return <PageTransition><>
    <PageHeader title="Finanzas" description="Caja real y estado de resultados por mes y línea de negocio">
      {isMember && <div className="flex flex-wrap gap-2"><NewFinancialRecordDialog options={options} />{isAdmin && <><NewRecurringItemDialog options={options} /><NewPaymentMethodDialog profiles={options.profiles} /></>}</div>}
    </PageHeader>
    <div className="space-y-6 p-4 sm:p-6">
      {migrationError ? <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Falta aplicar la migración de Finanzas en el Supabase de Operon CRM. No se modificó ninguna otra base.</div> : <>
        <form className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-end">
          <div className="flex-1"><label htmlFor="finance-month" className="label-mono text-muted-foreground">Mes</label><div className="mt-1 flex items-center gap-1"><Button variant="outline" size="icon-sm" render={<Link href={`/finanzas?month=${previousMonth}${unitQuery}`} aria-label="Mes anterior" />}><ArrowLeft className="size-4" /></Button><input id="finance-month" name="month" type="month" defaultValue={month} className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm" /><Button variant="outline" size="icon-sm" render={<Link href={`/finanzas?month=${nextMonth}${unitQuery}`} aria-label="Mes siguiente" />}><ArrowRight className="size-4" /></Button></div></div>
          <div className="flex-1"><label htmlFor="finance-unit" className="label-mono text-muted-foreground">Negocio</label><select id="finance-unit" name="unit" defaultValue={selectedUnitId} className="mt-1 h-9 w-full rounded-lg border bg-background px-3 text-sm"><option value="all">Todo Operon</option>{units.filter((unit) => unit.active).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></div>
          <Button type="submit"><SlidersHorizontal className="mr-1 size-4" />Ver resultado</Button>
        </form>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
          <KpiCard index={0} label="Cobros de caja" tone="success" icon={<ArrowDownLeft />} display={<strong className="font-mono text-xl">{formatMoney(management.cashIncomeArs, "ARS")}</strong>} hint={monthLabel} />
          <KpiCard index={1} label="Pagos de caja" icon={<ArrowUpRight />} display={<strong className="font-mono text-xl">{formatMoney(management.cashExpenseArs, "ARS")}</strong>} hint={monthLabel} />
          <KpiCard index={2} label="Flujo neto" tone={management.cashNetArs < 0 ? "danger" : "primary"} icon={<Landmark />} display={<strong className="font-mono text-xl">{formatMoney(management.cashNetArs, "ARS")}</strong>} hint={selectedUnitName} />
          <KpiCard index={3} label="Resultado económico" tone={management.economicNetArs < 0 ? "danger" : "success"} icon={<Scale />} display={<strong className="font-mono text-xl">{formatMoney(management.economicNetArs, "ARS")}</strong>} hint={selectedUnitName} />
        </div>
        {management.unconvertedItems > 0 && <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">Hay {management.unconvertedItems} registros USD históricos sin cotización; se excluyen del consolidado en pesos.</p>}
        <IncomeStatement summary={management} lines={statementLines} monthLabel={monthLabel} unitName={selectedUnitName} />
        <div className="grid gap-4 xl:grid-cols-2"><BusinessUnitResults rows={unitResults} /><PartnerAdvances rows={partnerAdvances} /></div>
        <Tabs defaultValue="movements"><TabsList><TabsTrigger value="movements">Movimientos</TabsTrigger><TabsTrigger value="recurring">Recurrentes</TabsTrigger><TabsTrigger value="methods">Medios de pago</TabsTrigger></TabsList>
          <TabsContent value="movements" className="space-y-3"><div className="flex items-center gap-2"><WalletCards className="size-4 text-muted-foreground" /><h2 className="font-heading text-sm font-semibold">Movimientos de {selectedUnitName}</h2><span className="font-mono text-xs text-muted-foreground">{records.length}</span></div><FinanceRecords records={records} options={options} isAdmin={isAdmin} /></TabsContent>
          <TabsContent value="recurring"><RecurringItemsTable rows={recurring} isAdmin={isAdmin} /></TabsContent><TabsContent value="methods"><PaymentMethodsGrid rows={methods} /></TabsContent>
        </Tabs>
      </>}
    </div>
  </></PageTransition>
}

/** "Visa · Santiago": el nombre del medio más de quién es, para saber dónde está el gasto. */
function methodLabel(item: { name: string; owner_type: string; owner_profile_id: string | null; owner_label: string | null }, profileNames: Map<string, string>) {
  const owner = item.owner_type === "operon" ? "Operon" : profileNames.get(item.owner_profile_id ?? "") ?? item.owner_label ?? "Socio"
  return item.name.toLowerCase().includes(owner.toLowerCase()) ? item.name : `${item.name} · ${owner}`
}

function toManagementRecord(record: { record_type: FinancialRecordType; expense_kind: "fixed" | "variable" | null; canceled_at: string | null; amount_ars: number | null; accrual_date: string; recognition_months: number }) {
  return { ...record, amount_ars: record.amount_ars == null ? null : Number(record.amount_ars) }
}

function shiftMonth(value: string, amount: number) {
  const [year, month] = value.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1 + amount, 1)).toISOString().slice(0, 7)
}
