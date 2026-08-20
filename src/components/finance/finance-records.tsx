"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MoreHorizontal } from "lucide-react"
import { toast } from "sonner"
import {
  cancelFinancialRecord,
  updateFinancialPayment,
} from "@/app/(app)/finanzas/actions"
import {
  FINANCIAL_RECORD_TYPE_LABELS,
  FINANCIAL_STATUS_LABELS,
  type FinancialRecordType,
  type FinancialStatus,
  type SupportedCurrency,
} from "@/lib/constants"
import { formatDate, formatMoney, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export type FinanceRow = {
  id: string
  recordType: FinancialRecordType
  concept: string
  currency: SupportedCurrency
  total: number
  paid: number
  balance: number
  dueDate: string | null
  paidAt: string | null
  status: FinancialStatus
  clientId: string | null
  clientName: string | null
  projectId: string | null
  projectName: string | null
  createdAt: string
}

const STATUS_CLASS: Record<FinancialStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  partial: "bg-primary/10 text-primary",
  paid: "bg-success/10 text-success",
  overdue: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground line-through",
}

export function FinancialStatusBadge({ status }: { status: FinancialStatus }) {
  return (
    <Badge variant="secondary" className={STATUS_CLASS[status]}>
      {FINANCIAL_STATUS_LABELS[status]}
    </Badge>
  )
}

export function FinanceRecords({ records }: { records: FinanceRow[] }) {
  const [editing, setEditing] = useState<FinanceRow | null>(null)

  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-dashed px-4 py-10 text-center">
        <p className="text-sm font-medium">Todavía no hay movimientos.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Cargá el primer ingreso o gasto desde “Nuevo registro”.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2 md:hidden">
        {records.map((record) => (
          <MobileRecord key={record.id} record={record} onEdit={setEditing} />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-xl border bg-background md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Concepto</TableHead>
              <TableHead>Cliente / proyecto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead className="w-10"><span className="sr-only">Acciones</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow key={record.id}>
                <TableCell>
                  <p className="font-medium">{record.concept}</p>
                  <p className="text-xs text-muted-foreground">
                    {FINANCIAL_RECORD_TYPE_LABELS[record.recordType]}
                  </p>
                </TableCell>
                <TableCell><Relations record={record} /></TableCell>
                <TableCell><FinancialStatusBadge status={record.status} /></TableCell>
                <TableCell className={cn("text-sm", record.status === "overdue" ? "text-destructive" : "text-muted-foreground") }>
                  {formatDate(record.dueDate)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatMoney(record.total, record.currency)}
                </TableCell>
                <TableCell className={cn("text-right font-mono tabular-nums", record.status === "overdue" && "text-destructive") }>
                  {formatMoney(record.balance, record.currency)}
                </TableCell>
                <TableCell><RecordMenu record={record} onEdit={setEditing} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <PaymentDialog record={editing} onClose={() => setEditing(null)} />
    </>
  )
}

function MobileRecord({ record, onEdit }: { record: FinanceRow; onEdit: (record: FinanceRow) => void }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{record.concept}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {FINANCIAL_RECORD_TYPE_LABELS[record.recordType]}
          </p>
        </div>
        <RecordMenu record={record} onEdit={onEdit} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <FinancialStatusBadge status={record.status} />
        <p className="font-mono text-sm font-medium tabular-nums">
          {formatMoney(record.balance, record.currency)} saldo
        </p>
      </div>
      <div className="mt-3 border-t pt-3 text-xs text-muted-foreground">
        <Relations record={record} />
        <p className="mt-1">Vence: {formatDate(record.dueDate)}</p>
      </div>
    </div>
  )
}

function Relations({ record }: { record: FinanceRow }) {
  return (
    <div className="max-w-56 text-sm text-muted-foreground">
      {record.clientId && record.clientName ? (
        <Link href={`/clientes/${record.clientId}`} className="block truncate hover:text-foreground hover:underline">
          {record.clientName}
        </Link>
      ) : record.clientName ? <span>{record.clientName}</span> : null}
      {record.projectId && record.projectName ? (
        <Link href={`/proyectos/${record.projectId}`} className="block truncate text-xs hover:text-foreground hover:underline">
          {record.projectName}
        </Link>
      ) : null}
      {!record.clientName && !record.projectName && <span>Sin vincular</span>}
    </div>
  )
}

function RecordMenu({ record, onEdit }: { record: FinanceRow; onEdit: (record: FinanceRow) => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function cancel() {
    startTransition(async () => {
      const result = await cancelFinancialRecord(record.id, record.clientId, record.projectId)
      if ("error" in result) toast.error(result.error)
      else {
        toast.success("Registro cancelado")
        router.refresh()
      }
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={`Acciones para ${record.concept}`} />}>
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {record.status !== "cancelled" && (
          <DropdownMenuItem onClick={() => onEdit(record)}>Actualizar cobro / pago</DropdownMenuItem>
        )}
        {record.status !== "cancelled" && (
          <DropdownMenuItem disabled={pending} onClick={cancel} className="text-destructive">
            Cancelar registro
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PaymentDialog({ record, onClose }: { record: FinanceRow | null; onClose: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!record) return null

  const action = updateFinancialPayment.bind(
    null,
    record.id,
    record.total,
    record.clientId,
    record.projectId
  )
  const recordType = record.recordType

  function submit(fd: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await action(null, fd)
      if ("error" in result) {
        setError(result.error)
        return
      }
      toast.success(recordType === "income" ? "Cobro actualizado" : "Pago actualizado")
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Actualizar {record.recordType === "income" ? "cobro" : "pago"}</DialogTitle>
          <DialogDescription>
            {record.concept} · total {formatMoney(record.total, record.currency)}
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="payment-amount">Monto acumulado</Label>
            <Input id="payment-amount" name="paid_amount" type="number" min="0" max={record.total} step="0.01" defaultValue={record.paid} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment-date">Fecha del último cobro / pago</Label>
            <Input id="payment-date" name="paid_at" type="date" defaultValue={record.paidAt ?? todayISO()} />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
