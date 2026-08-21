"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckCircle2, History, MoreHorizontal, Plus, ReceiptText } from "lucide-react"
import { toast } from "sonner"
import {
  addFinancialPayment,
  cancelFinancialRecordWithReason,
  completeFinancialRecord,
  updateFinancialRecord,
} from "@/app/(app)/finanzas/actions"
import type { ActionResult } from "@/lib/action-result"
import {
  FINANCIAL_RECORD_TYPE_LABELS,
  FINANCIAL_STATUS_LABELS,
  SUPPORTED_CURRENCIES,
  type FinancialRecordType,
  type FinancialStatus,
  type SupportedCurrency,
} from "@/lib/constants"
import { formatDateNumeric, formatMoney, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { FinanceOption } from "@/components/finance/new-record-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

type Payment = { id: string; amount: number; paidOn: string; note: string | null; createdAt: string; actor: string | null }
type HistoryItem = { id: number; changeType: string; changedAt: string; note: string | null; actor: string | null }

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
  notes: string | null
  canceledAt: string | null
  cancelReason: string | null
  payments: Payment[]
  history: HistoryItem[]
}

const STATUS_CLASS: Record<FinancialStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  partial: "bg-primary/10 text-primary",
  paid: "bg-success/10 text-success",
  overdue: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground line-through",
}

export function FinancialStatusBadge({ status }: { status: FinancialStatus }) {
  return <Badge variant="secondary" className={STATUS_CLASS[status]}>{FINANCIAL_STATUS_LABELS[status]}</Badge>
}

export function FinanceRecords({ records, clients, projects, isAdmin }: { records: FinanceRow[]; clients: FinanceOption[]; projects: FinanceOption[]; isAdmin: boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = records.find((record) => record.id === editingId) ?? null
  if (records.length === 0) return <div className="rounded-xl border border-dashed px-4 py-10 text-center"><p className="text-sm font-medium">Todavía no hay movimientos.</p><p className="mt-1 text-sm text-muted-foreground">El primer registro se crea desde el encabezado.</p></div>
  return <>
    <div className="space-y-2 md:hidden">{records.map((record) => <MobileRecord key={record.id} record={record} onOpen={() => setEditingId(record.id)} />)}</div>
    <div className="hidden overflow-hidden rounded-xl border bg-background md:block"><Table><TableHeader><TableRow><TableHead>Concepto</TableHead><TableHead>Cliente / proyecto</TableHead><TableHead>Estado</TableHead><TableHead>Vencimiento</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Saldo</TableHead><TableHead className="w-10"><span className="sr-only">Acciones</span></TableHead></TableRow></TableHeader><TableBody>{records.map((record) => <TableRow key={record.id}><TableCell><p className="font-medium">{record.concept}</p><p className="text-xs text-muted-foreground">{FINANCIAL_RECORD_TYPE_LABELS[record.recordType]}</p></TableCell><TableCell><Relations record={record} /></TableCell><TableCell><FinancialStatusBadge status={record.status} /></TableCell><TableCell className={cn("text-sm", record.status === "overdue" ? "text-destructive" : "text-muted-foreground")}>{formatDateNumeric(record.dueDate)}</TableCell><TableCell className="text-right font-mono tabular-nums">{formatMoney(record.total, record.currency)}</TableCell><TableCell className={cn("text-right font-mono tabular-nums", record.status === "overdue" && "text-destructive")}>{formatMoney(record.balance, record.currency)}</TableCell><TableCell><RecordMenu record={record} onOpen={() => setEditingId(record.id)} isAdmin={isAdmin} /></TableCell></TableRow>)}</TableBody></Table></div>
    <RecordDialog record={editing} clients={clients} projects={projects} isAdmin={isAdmin} onClose={() => setEditingId(null)} />
  </>
}

function MobileRecord({ record, onOpen }: { record: FinanceRow; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className="w-full rounded-xl border bg-card p-4 text-left"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{record.concept}</p><p className="mt-0.5 text-xs text-muted-foreground">{FINANCIAL_RECORD_TYPE_LABELS[record.recordType]}</p></div><FinancialStatusBadge status={record.status} /></div><div className="mt-3 flex items-end justify-between gap-3 border-t pt-3"><Relations record={record} /><p className="font-mono text-sm font-medium tabular-nums">{formatMoney(record.balance, record.currency)}</p></div></button>
}

function Relations({ record }: { record: FinanceRow }) {
  return <div className="max-w-56 text-sm text-muted-foreground">{record.clientId && record.clientName ? <Link href={`/clientes/${record.clientId}`} className="block truncate hover:text-foreground hover:underline">{record.clientName}</Link> : record.clientName ? <span>{record.clientName}</span> : null}{record.projectId && record.projectName ? <Link href={`/proyectos/${record.projectId}`} className="block truncate text-xs hover:text-foreground hover:underline">{record.projectName}</Link> : null}{!record.clientName && !record.projectName && <span>Sin vincular</span>}</div>
}

function RecordMenu({ record, onOpen, isAdmin }: { record: FinanceRow; onOpen: () => void; isAdmin: boolean }) {
  return <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={`Acciones para ${record.concept}`} />}><MoreHorizontal className="size-4" /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={onOpen}>{isAdmin && record.status !== "cancelled" ? "Editar e historial" : "Ver historial"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
}

function RecordDialog({ record, clients, projects, isAdmin, onClose }: { record: FinanceRow | null; clients: FinanceOption[]; projects: FinanceOption[]; isAdmin: boolean; onClose: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  if (!record) return null
  const active = record.status !== "cancelled"
  function run(action: Promise<ActionResult>, success: string) {
    setError(null)
    startTransition(async () => {
      const result = await action
      if ("error" in result) { setError(result.error); return }
      toast.success(result.message ?? success)
      router.refresh()
    })
  }
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"><DialogHeader className="border-b p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><DialogTitle>{record.concept}</DialogTitle><DialogDescription className="mt-1">{FINANCIAL_RECORD_TYPE_LABELS[record.recordType]} · creado {formatDateNumeric(record.createdAt)}</DialogDescription></div><FinancialStatusBadge status={record.status} /></div></DialogHeader><div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
    <div className="grid grid-cols-3 gap-2"><Amount label="Total" value={record.total} currency={record.currency} /><Amount label="Registrado" value={record.paid} currency={record.currency} /><Amount label="Saldo" value={record.balance} currency={record.currency} danger={record.status === "overdue"} /></div>
    {record.cancelReason && <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm"><p className="font-medium text-destructive">Cancelado el {formatDateNumeric(record.canceledAt)}</p><p className="mt-1 text-muted-foreground">{record.cancelReason}</p></div>}
    {isAdmin && active && <>
      <section className="rounded-xl border p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><Plus className="size-4" />Agregar pago parcial</h3><form action={(fd) => run(addFinancialPayment(record.id, record.clientId, record.projectId, null, fd), "Pago registrado")} className="mt-3 grid gap-3 sm:grid-cols-3"><Field label="Monto"><Input name="payment_amount" type="number" min="0.01" max={record.balance} step="0.01" required /></Field><Field label="Fecha"><Input name="paid_on" type="date" defaultValue={todayISO()} required /></Field><Field label="Nota"><Input name="payment_note" placeholder="Referencia opcional" /></Field><div className="flex flex-wrap gap-2 sm:col-span-3"><Button type="submit" disabled={pending}>Registrar pago</Button>{record.balance > 0 && <Button type="button" variant="outline" disabled={pending} onClick={() => run(completeFinancialRecord(record.id, record.clientId, record.projectId, todayISO()), "Saldo completado")}><CheckCircle2 className="mr-1 size-4" />Completar saldo</Button>}</div></form></section>
      <details className="rounded-xl border p-4"><summary className="text-sm font-semibold">Editar movimiento</summary><form action={(fd) => run(updateFinancialRecord(null, fd), "Movimiento actualizado")} className="mt-4 grid gap-3 sm:grid-cols-2"><input type="hidden" name="record_id" value={record.id} /><Field label="Concepto" wide><Input name="concept" required defaultValue={record.concept} /></Field><Field label="Total"><Input name="total_amount" type="number" min={record.paid} step="0.01" required defaultValue={record.total} /></Field><Field label="Moneda"><Select name="currency" defaultValue={record.currency}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SUPPORTED_CURRENCIES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Field><Field label="Vencimiento"><Input name="due_date" type="date" defaultValue={record.dueDate ?? ""} /></Field><Field label="Cliente"><Select name="client_id" defaultValue={record.clientId ?? undefined} items={Object.fromEntries(clients.map((item) => [item.id, item.name]))}><SelectTrigger><SelectValue placeholder="Sin vincular" /></SelectTrigger><SelectContent>{clients.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></Field><Field label="Proyecto"><Select name="project_id" defaultValue={record.projectId ?? undefined} items={Object.fromEntries(projects.map((item) => [item.id, item.name]))}><SelectTrigger><SelectValue placeholder="Sin vincular" /></SelectTrigger><SelectContent>{projects.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></Field><Field label="Notas" wide><Textarea name="notes" defaultValue={record.notes ?? ""} rows={3} /></Field><div className="sm:col-span-2"><Button type="submit" disabled={pending}>Guardar cambios</Button></div></form></details>
      <details className="rounded-xl border border-destructive/20 p-4"><summary className="text-sm font-semibold text-destructive">Cancelar movimiento</summary><form action={(fd) => run(cancelFinancialRecordWithReason(null, fd), "Movimiento cancelado")} className="mt-3 flex flex-col gap-3 sm:flex-row"><input type="hidden" name="record_id" value={record.id} /><input type="hidden" name="client_id" value={record.clientId ?? ""} /><input type="hidden" name="project_id" value={record.projectId ?? ""} /><Input name="cancel_reason" required minLength={3} placeholder="Motivo obligatorio" /><Button type="submit" variant="destructive" disabled={pending}>Cancelar</Button></form></details>
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <section><h3 className="flex items-center gap-2 text-sm font-semibold"><ReceiptText className="size-4" />Pagos inmutables</h3><div className="mt-3 space-y-2">{record.payments.length ? record.payments.map((payment) => <div key={payment.id} className="flex items-start justify-between gap-3 rounded-lg border p-3"><div><p className="text-sm font-medium">{payment.note ?? "Pago registrado"}</p><p className="label-mono mt-1 text-muted-foreground">{formatDateNumeric(payment.paidOn)} · {payment.actor ?? "Sistema"}</p></div><span className="font-mono text-sm">{formatMoney(payment.amount, record.currency)}</span></div>) : <p className="text-sm text-muted-foreground">Todavía no hay pagos.</p>}</div></section>
    <section><h3 className="flex items-center gap-2 text-sm font-semibold"><History className="size-4" />Trazabilidad</h3><div className="mt-3 space-y-2">{record.history.length ? record.history.map((item) => <div key={item.id} className="border-l-2 pl-3 text-sm"><p>{historyLabel(item.changeType)}</p><p className="label-mono mt-1 text-muted-foreground">{formatDateNumeric(item.changedAt)} · {item.actor ?? "Sistema"}</p></div>) : <p className="text-sm text-muted-foreground">Sin cambios posteriores.</p>}</div></section>
  </div><DialogFooter className="border-t bg-card p-4"><Button type="button" variant="outline" onClick={onClose}>Cerrar</Button></DialogFooter></DialogContent></Dialog>
}

function Amount({ label, value, currency, danger = false }: { label: string; value: number; currency: SupportedCurrency; danger?: boolean }) { return <div className="rounded-lg bg-muted/45 p-3"><p className="label-mono text-muted-foreground">{label}</p><p className={cn("mt-1 font-mono text-sm font-semibold", danger && "text-destructive")}>{formatMoney(value, currency)}</p></div> }
function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <div className={wide ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}><Label>{label}</Label>{children}</div> }
function historyLabel(value: string) { return ({ payment_added: "Pago agregado", updated: "Movimiento editado", cancelled: "Movimiento cancelado" } as Record<string, string>)[value] ?? value.replaceAll("_", " ") }
