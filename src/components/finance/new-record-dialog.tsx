"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { createFinancialRecord } from "@/app/(app)/finanzas/actions"
import {
  FINANCE_EXCHANGE_RATE_LABELS,
  FINANCE_EXPENSE_CATEGORIES,
  FINANCE_INCOME_CATEGORIES,
  FINANCIAL_RECORD_TYPE_LABELS,
  type FinanceExchangeRateType,
  type FinancialRecordType,
  type SupportedCurrency,
} from "@/lib/constants"
import { todayISO } from "@/lib/format"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export type FinanceOption = { id: string; name: string }
export type FinanceContactOption = FinanceOption & { phone: string | null }
export type FinancePaymentMethodOption = FinanceOption & {
  ownerProfileId: string | null
  currency: string
}
export type FinanceFormOptions = {
  businessUnits: FinanceOption[]
  clients: FinanceOption[]
  contacts: FinanceContactOption[]
  projects: FinanceOption[]
  paymentMethods: FinancePaymentMethodOption[]
  profiles: FinanceOption[]
}

type RatesResponse = {
  official?: { sellRate: number }
  blue?: { sellRate: number }
}

const selectClass = "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"

export function NewFinancialRecordDialog({
  options: providedOptions,
  clients = [],
  projects = [],
  open: controlledOpen,
  onOpenChange,
  showTrigger = true,
}: {
  options?: FinanceFormOptions
  clients?: FinanceOption[]
  projects?: FinanceOption[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
  showTrigger?: boolean
}) {
  const router = useRouter()
  const [internalOpen, setInternalOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [recordType, setRecordType] = useState<FinancialRecordType>("income")
  const [currency, setCurrency] = useState<SupportedCurrency>("ARS")
  const [rateType, setRateType] = useState<FinanceExchangeRateType>("official")
  const [rates, setRates] = useState<RatesResponse | null>(null)
  const options = providedOptions ?? {
    businessUnits: [{ id: "b1000000-0000-0000-0000-000000000001", name: "General" }],
    clients,
    contacts: [],
    projects,
    paymentMethods: [],
    profiles: [],
  }
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  const categories = recordType === "income" ? FINANCE_INCOME_CATEGORIES : FINANCE_EXPENSE_CATEGORIES
  const quotedRate = useMemo(() => rateType === "official" ? rates?.official?.sellRate : rates?.blue?.sellRate, [rateType, rates])

  useEffect(() => {
    if (!open || currency !== "USD" || rates) return
    const controller = new AbortController()
    fetch("/api/exchange-rates", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((value: RatesResponse | null) => value && setRates(value))
      .catch(() => undefined)
    return () => controller.abort()
  }, [currency, open, rates])

  function submit(fd: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await createFinancialRecord(null, fd)
      if ("error" in result) return setError(result.error)
      toast.success("Registro financiero creado")
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) setError(null); setOpen(next) }}>
      {showTrigger && <DialogTrigger render={<Button size="sm" />}><Plus className="mr-1 size-4" /> Movimiento</DialogTrigger>}
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo ingreso o gasto</DialogTitle>
          <DialogDescription>Registrá cuándo corresponde económicamente y, si ya ocurrió, el cobro o pago real.</DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipo" htmlFor="finance-record-type">
              <select id="finance-record-type" name="record_type" className={selectClass} value={recordType} onChange={(event) => setRecordType(event.target.value as FinancialRecordType)}>
                {Object.entries(FINANCIAL_RECORD_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Línea de negocio" htmlFor="finance-business-unit">
              <select id="finance-business-unit" name="business_unit_id" className={selectClass} required defaultValue={options.businessUnits[0]?.id}>
                {options.businessUnits.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Concepto" htmlFor="finance-concept"><Input id="finance-concept" name="concept" placeholder={recordType === "income" ? "Instalación o abono" : "Supabase, IA, infraestructura…"} required autoComplete="off" /></Field>
            <Field label="Categoría" htmlFor="finance-category"><select key={recordType} id="finance-category" name="category" className={selectClass} defaultValue={categories[0]}>{categories.map((category) => <option key={category}>{category}</option>)}</select></Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Monto total" htmlFor="finance-total"><Input id="finance-total" name="total_amount" type="number" min="0.01" step="0.01" required /></Field>
            <Field label="Moneda" htmlFor="finance-currency"><select id="finance-currency" name="currency" className={selectClass} value={currency} onChange={(event) => setCurrency(event.target.value as SupportedCurrency)}><option value="ARS">Pesos (ARS)</option><option value="USD">Dólares (USD)</option></select></Field>
            {currency === "USD" && <Field label="Cotización" htmlFor="finance-rate-type"><select id="finance-rate-type" name="exchange_rate_type" className={selectClass} value={rateType} onChange={(event) => setRateType(event.target.value as FinanceExchangeRateType)}><option value="official">Oficial venta</option><option value="blue">Blue venta</option><option value="manual">Manual</option></select></Field>}
          </div>
          {currency === "USD" && <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            {rateType === "manual" ? <Field label="Pesos por USD" htmlFor="finance-manual-rate"><Input id="finance-manual-rate" name="manual_exchange_rate" type="number" min="0.01" step="0.01" required /></Field> : quotedRate ? <span>{FINANCE_EXCHANGE_RATE_LABELS[rateType]} actual: <strong className="text-foreground">${quotedRate.toLocaleString("es-AR")}</strong>. Se guardará al crear el movimiento.</span> : <span>La cotización se consultará y guardará al crear el movimiento.</span>}
          </div>}

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Cliente" htmlFor="finance-client"><OptionalSelect id="finance-client" name="client_id" options={options.clients} empty="Sin cliente" /></Field>
            <Field label="Contacto para cobrar" htmlFor="finance-contact"><OptionalSelect id="finance-contact" name="contact_id" options={options.contacts} empty="Sin contacto" /></Field>
            <Field label="Proyecto" htmlFor="finance-project"><OptionalSelect id="finance-project" name="project_id" options={options.projects} empty="Sin proyecto" /></Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Fecha económica" htmlFor="finance-accrual"><Input id="finance-accrual" name="accrual_date" type="date" defaultValue={todayISO()} required /></Field>
            <Field label="Distribuir en meses" htmlFor="finance-months"><Input id="finance-months" name="recognition_months" type="number" min="1" max="120" defaultValue="1" required /></Field>
            <Field label="Vencimiento" htmlFor="finance-due"><Input id="finance-due" name="due_date" type="date" /></Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Medio o cuenta" htmlFor="finance-payment-method"><OptionalSelect id="finance-payment-method" name="payment_method_id" options={options.paymentMethods} empty="Sin definir" /></Field>
            {recordType === "expense" && <Field label="Pagado o adelantado por" htmlFor="finance-paid-by"><OptionalSelect id="finance-paid-by" name="paid_by_profile_id" options={options.profiles} empty="Operon" /></Field>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ya cobrado / pagado" htmlFor="finance-paid"><Input id="finance-paid" name="paid_amount" type="number" min="0" step="0.01" defaultValue="0" /></Field>
            <Field label="Fecha del cobro / pago" htmlFor="finance-paid-at"><Input id="finance-paid-at" name="paid_at" type="date" defaultValue={todayISO()} /></Field>
          </div>

          <Field label="Notas" htmlFor="finance-notes"><Textarea id="finance-notes" name="notes" rows={2} /></Field>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter><Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar movimiento"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function OptionalSelect({ id, name, options, empty }: { id: string; name: string; options: FinanceOption[]; empty: string }) {
  return <select id={id} name={name} className={selectClass} defaultValue=""><option value="">{empty}</option>{options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label htmlFor={htmlFor}>{label}</Label>{children}</div>
}
