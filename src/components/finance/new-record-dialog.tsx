"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { createFinancialRecord } from "@/app/(app)/finanzas/actions"
import {
  FINANCIAL_RECORD_TYPE_LABELS,
  SUPPORTED_CURRENCIES,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

export type FinanceOption = { id: string; name: string }

export function NewFinancialRecordDialog({
  clients,
  projects,
  open: controlledOpen,
  onOpenChange,
  showTrigger = true,
}: {
  clients: FinanceOption[]
  projects: FinanceOption[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
  showTrigger?: boolean
}) {
  const router = useRouter()
  const [internalOpen, setInternalOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  function submit(fd: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await createFinancialRecord(null, fd)
      if ("error" in result) {
        setError(result.error)
        return
      }
      toast.success("Registro financiero creado")
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null)
        setOpen(next)
      }}
    >
      {showTrigger && (
        <DialogTrigger render={<Button size="sm" />}>
          <Plus className="mr-1 h-4 w-4" />
          Nuevo registro
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo registro financiero</DialogTitle>
          <DialogDescription>
            Control operativo de cobros y gastos. No genera facturas ni mueve dinero.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipo">
              <Select
                name="record_type"
                defaultValue="income"
                items={FINANCIAL_RECORD_TYPE_LABELS}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(FINANCIAL_RECORD_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Moneda">
              <Select name="currency" defaultValue="ARS">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((currency) => (
                    <SelectItem key={currency} value={currency}>{currency}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Concepto" htmlFor="finance-concept">
            <Input id="finance-concept" name="concept" required autoComplete="off" />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Monto total" htmlFor="finance-total">
              <Input id="finance-total" name="total_amount" type="number" min="0.01" step="0.01" required />
            </Field>
            <Field label="Ya cobrado / pagado" htmlFor="finance-paid">
              <Input id="finance-paid" name="paid_amount" type="number" min="0" step="0.01" defaultValue="0" />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Vencimiento" htmlFor="finance-due">
              <Input id="finance-due" name="due_date" type="date" />
            </Field>
            <Field label="Fecha de cobro / pago" htmlFor="finance-paid-at">
              <Input id="finance-paid-at" name="paid_at" type="date" defaultValue={todayISO()} />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cliente">
              <Select name="client_id" items={Object.fromEntries(clients.map((c) => [c.id, c.name]))}>
                <SelectTrigger><SelectValue placeholder="Sin vincular" /></SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Proyecto">
              <Select name="project_id" items={Object.fromEntries(projects.map((p) => [p.id, p.name]))}>
                <SelectTrigger><SelectValue placeholder="Sin vincular" /></SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Notas" htmlFor="finance-notes">
            <Textarea id="finance-notes" name="notes" rows={2} />
          </Field>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar registro"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}
