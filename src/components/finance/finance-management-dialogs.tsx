"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CreditCard, Repeat2 } from "lucide-react"
import { toast } from "sonner"
import {
  createFinancePaymentMethod,
  createFinanceRecurringItem,
} from "@/app/(app)/finanzas/actions"
import {
  FINANCE_EXPENSE_CATEGORIES,
  FINANCE_FREQUENCY_LABELS,
  FINANCE_INCOME_CATEGORIES,
  FINANCE_PAYMENT_METHOD_LABELS,
  type FinanceExchangeRateType,
  type FinancialRecordType,
  type SupportedCurrency,
} from "@/lib/constants"
import { todayISO } from "@/lib/format"
import type { FinanceFormOptions, FinanceOption } from "@/components/finance/new-record-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

const selectClass = "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"

export function NewRecurringItemDialog({ options }: { options: FinanceFormOptions }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [recordType, setRecordType] = useState<FinancialRecordType>("income")
  const [currency, setCurrency] = useState<SupportedCurrency>("USD")
  const [rateType, setRateType] = useState<FinanceExchangeRateType>("official")
  const categories = recordType === "income" ? FINANCE_INCOME_CATEGORIES : FINANCE_EXPENSE_CATEGORIES

  function submit(fd: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await createFinanceRecurringItem(null, fd)
      if ("error" in result) return setError(result.error)
      toast.success(result.message)
      setOpen(false)
      router.refresh()
    })
  }

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger render={<Button size="sm" variant="outline" />}><Repeat2 className="mr-1 size-4" /> Recurrente</DialogTrigger>
    <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>Nuevo abono o gasto recurrente</DialogTitle><DialogDescription>Creá la plantilla y generá cada vencimiento conservando su cotización histórica.</DialogDescription></DialogHeader>
      <form action={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo"><select name="record_type" className={selectClass} value={recordType} onChange={(event) => setRecordType(event.target.value as FinancialRecordType)}><option value="income">Ingreso</option><option value="expense">Gasto</option></select></Field>
          <Field label="Línea de negocio"><select name="business_unit_id" className={selectClass} required defaultValue={options.businessUnits[0]?.id}>{options.businessUnits.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Concepto"><Input name="concept" placeholder="Abono Operon Reserva" required /></Field>
          <Field label="Categoría"><select key={recordType} name="category" className={selectClass} defaultValue={categories[0]}>{categories.map((item) => <option key={item}>{item}</option>)}</select></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Monto"><Input name="total_amount" type="number" min="0.01" step="0.01" required /></Field>
          <Field label="Moneda"><select name="currency" className={selectClass} value={currency} onChange={(event) => setCurrency(event.target.value as SupportedCurrency)}><option value="ARS">ARS</option><option value="USD">USD</option></select></Field>
          {currency === "USD" && <Field label="Cotización"><select name="exchange_rate_type" className={selectClass} value={rateType} onChange={(event) => setRateType(event.target.value as FinanceExchangeRateType)}><option value="official">Oficial venta</option><option value="blue">Blue venta</option><option value="manual">Manual fija</option></select></Field>}
        </div>
        {currency === "USD" && rateType === "manual" && <Field label="Pesos por USD"><Input name="manual_exchange_rate" type="number" min="0.01" step="0.01" required /></Field>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Cliente"><OptionalSelect name="client_id" options={options.clients} empty="Sin cliente" /></Field>
          <Field label="Contacto para cobrar"><OptionalSelect name="contact_id" options={options.contacts} empty="Sin contacto" /></Field>
          <Field label="Proyecto"><OptionalSelect name="project_id" options={options.projects} empty="Sin proyecto" /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Frecuencia"><select name="frequency" className={selectClass}>{Object.entries(FINANCE_FREQUENCY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          <Field label="Próximo vencimiento"><Input name="next_due_date" type="date" defaultValue={todayISO()} required /></Field>
          <Field label="Finaliza"><Input name="end_date" type="date" /></Field>
          <Field label="Devengar en meses"><Input name="recognition_months" type="number" min="1" max="120" defaultValue="1" required /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Medio o cuenta"><OptionalSelect name="payment_method_id" options={options.paymentMethods} empty="Sin definir" /></Field>
          {recordType === "expense" && <Field label="Pagado por"><OptionalSelect name="paid_by_profile_id" options={options.profiles} empty="Operon" /></Field>}
        </div>
        <Field label="Notas"><Textarea name="notes" rows={2} /></Field>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar recurrencia"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}

export function NewPaymentMethodDialog({ profiles }: { profiles: FinanceOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [ownerType, setOwnerType] = useState("operon")

  function submit(fd: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await createFinancePaymentMethod(null, fd)
      if ("error" in result) return setError(result.error)
      toast.success(result.message)
      setOpen(false)
      router.refresh()
    })
  }

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger render={<Button size="sm" variant="outline" />}><CreditCard className="mr-1 size-4" /> Medio</DialogTrigger>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle>Nuevo medio de pago</DialogTitle><DialogDescription>Guardá una referencia y, opcionalmente, los últimos cuatro dígitos. Nunca cargues el número completo ni el código de seguridad.</DialogDescription></DialogHeader>
      <form action={submit} className="space-y-4">
        <Field label="Nombre"><Input name="name" placeholder="Visa Tomás" required /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo"><select name="method_type" className={selectClass}>{Object.entries(FINANCE_PAYMENT_METHOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          <Field label="Titular"><select name="owner_type" className={selectClass} value={ownerType} onChange={(event) => setOwnerType(event.target.value)}><option value="operon">Operon</option><option value="partner">Socio</option></select></Field>
        </div>
        {ownerType === "partner" && <div className="grid gap-3 sm:grid-cols-2"><Field label="Socio"><OptionalSelect name="owner_profile_id" options={profiles} empty="Elegir socio" /></Field><Field label="Nombre alternativo"><Input name="owner_label" placeholder="Si todavía no tiene usuario" /></Field></div>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Moneda"><select name="currency" className={selectClass}><option value="ARS">ARS</option><option value="USD">USD</option></select></Field>
          <Field label="Banco o entidad"><Input name="institution" /></Field>
          <Field label="Últimos cuatro"><Input name="last_four" inputMode="numeric" minLength={4} maxLength={4} /></Field>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar medio"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}

function OptionalSelect({ name, options, empty }: { name: string; options: FinanceOption[]; empty: string }) {
  return <select name={name} className={selectClass} defaultValue=""><option value="">{empty}</option>{options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>
}
