"use client"

import { useActionState, useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { Archive, MessageSquare, Plus, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  archiveClient,
  createContact,
  deleteContact,
  updateClient,
  updateContact,
} from "@/app/(app)/clientes/actions"
import { createTeamConversation } from "@/app/(app)/bandeja/actions"
import type { ActionResult } from "@/lib/action-result"
import { CLIENT_STATUS_LABELS } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

function useFeedback<T>(state: ActionResult<T> | null) {
  useEffect(() => {
    if (state && "ok" in state) toast.success(state.message ?? "Cambios guardados")
  }, [state])
}

export function ClientEditForm({
  client,
  profiles,
}: {
  client: {
    id: string
    organization_id: string | null
    status: keyof typeof CLIENT_STATUS_LABELS
    owner_id: string | null
    notes: string | null
    organization: {
      name: string
      website: string | null
      domain: string | null
      industry: string | null
      size: string | null
      country: string | null
      city: string | null
      linkedin: string | null
      notes: string | null
    }
  }
  profiles: { id: string; full_name: string }[]
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    updateClient,
    null
  )
  useFeedback(state)
  const organization = client.organization
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4"><CardTitle className="text-base">Datos del cliente</CardTitle></CardHeader>
      <CardContent className="p-5">
        <form action={action} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="client_id" value={client.id} />
          <input type="hidden" name="organization_id" value={client.organization_id ?? ""} />
          <Field label="Empresa"><Input name="name" defaultValue={organization.name} required /></Field>
          <Field label="Estado"><Select name="status" defaultValue={client.status} items={CLIENT_STATUS_LABELS}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CLIENT_STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Sitio web"><Input name="website" type="url" defaultValue={organization.website ?? ""} /></Field>
          <Field label="Dominio"><Input name="domain" defaultValue={organization.domain ?? ""} /></Field>
          <Field label="Rubro"><Input name="industry" defaultValue={organization.industry ?? ""} /></Field>
          <Field label="Tamaño"><Input name="size" defaultValue={organization.size ?? ""} /></Field>
          <Field label="Ciudad"><Input name="city" defaultValue={organization.city ?? ""} /></Field>
          <Field label="País"><Input name="country" defaultValue={organization.country ?? ""} /></Field>
          <Field label="LinkedIn"><Input name="linkedin" type="url" defaultValue={organization.linkedin ?? ""} /></Field>
          <Field label="Responsable"><Select name="owner_id" defaultValue={client.owner_id ?? undefined} items={Object.fromEntries(profiles.map((profile) => [profile.id, profile.full_name]))}><SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger><SelectContent>{profiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.full_name}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Notas del cliente" wide><Textarea name="notes" rows={4} defaultValue={client.notes ?? ""} /></Field>
          <Field label="Notas de empresa" wide><Textarea name="organization_notes" rows={4} defaultValue={organization.notes ?? ""} /></Field>
          {state && "error" in state && <p className="text-sm text-destructive sm:col-span-2">{state.error}</p>}
          <div className="sm:col-span-2"><Button type="submit" disabled={pending}><Save className="mr-1 size-4" />{pending ? "Guardando…" : "Guardar cambios"}</Button></div>
        </form>
      </CardContent>
    </Card>
  )
}

export function ContactManager({ clientId, organizationId, contacts }: { clientId: string; organizationId: string; contacts: { id: string; full_name: string; title: string | null; email: string | null; phone: string | null; linkedin: string | null; notes: string | null }[] }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(createContact, null)
  useFeedback(state)
  useEffect(() => { if (state && "ok" in state) queueMicrotask(() => setOpen(false)) }, [state])
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex-row items-center justify-between border-b py-4"><CardTitle className="text-base">Contactos</CardTitle><Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={<Button size="sm" variant="outline" />}><Plus className="mr-1 size-4" />Agregar</DialogTrigger><DialogContent><DialogHeader><DialogTitle>Nuevo contacto</DialogTitle><DialogDescription>Datos comerciales; no guardes credenciales ni secretos.</DialogDescription></DialogHeader><form action={action} className="space-y-4"><input type="hidden" name="client_id" value={clientId} /><input type="hidden" name="organization_id" value={organizationId} /><ContactFields />{state && "error" in state && <p className="text-sm text-destructive">{state.error}</p>}<DialogFooter><Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Agregar contacto"}</Button></DialogFooter></form></DialogContent></Dialog></CardHeader>
      <CardContent className="divide-y p-0">
        {contacts.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Todavía no hay contactos.</p> : contacts.map((contact) => <ContactEditor key={contact.id} clientId={clientId} contact={contact} />)}
      </CardContent>
    </Card>
  )
}

function ContactEditor({ clientId, contact }: { clientId: string; contact: { id: string; full_name: string; title: string | null; email: string | null; phone: string | null; linkedin: string | null; notes: string | null } }) {
  const [editing, setEditing] = useState(false)
  const [deleting, startTransition] = useTransition()
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(updateContact, null)
  useFeedback(state)
  useEffect(() => { if (state && "ok" in state) queueMicrotask(() => setEditing(false)) }, [state])
  if (!editing) return <div className="flex items-start justify-between gap-4 p-5"><div><p className="font-heading text-sm font-semibold">{contact.full_name}</p><p className="mt-1 text-xs text-muted-foreground">{[contact.title, contact.email, contact.phone].filter(Boolean).join(" · ") || "Sin datos adicionales"}</p></div><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Editar</Button><Button size="icon-sm" variant="ghost" disabled={deleting} aria-label={`Eliminar ${contact.full_name}`} onClick={() => { if (!window.confirm(`¿Eliminar a ${contact.full_name}?`)) return; startTransition(async () => { const result = await deleteContact(contact.id, clientId); if ("error" in result) toast.error(result.error); else toast.success("Contacto eliminado") }) }}><Trash2 className="size-4 text-destructive" /></Button></div></div>
  return <form action={action} className="space-y-4 bg-muted/15 p-5"><input type="hidden" name="client_id" value={clientId} /><input type="hidden" name="contact_id" value={contact.id} /><ContactFields contact={contact} />{state && "error" in state && <p className="text-sm text-destructive">{state.error}</p>}<div className="flex gap-2"><Button type="submit" size="sm" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button></div></form>
}

function ContactFields({ contact }: { contact?: { full_name: string; title: string | null; email: string | null; phone: string | null; linkedin: string | null; notes: string | null } }) {
  return <div className="grid gap-3 sm:grid-cols-2"><Field label="Nombre"><Input name="full_name" required defaultValue={contact?.full_name} /></Field><Field label="Cargo"><Input name="title" defaultValue={contact?.title ?? ""} /></Field><Field label="Email"><Input name="email" type="email" defaultValue={contact?.email ?? ""} /></Field><Field label="Teléfono"><Input name="phone" defaultValue={contact?.phone ?? ""} /></Field><Field label="LinkedIn" wide><Input name="linkedin" type="url" defaultValue={contact?.linkedin ?? ""} /></Field><Field label="Notas" wide><Textarea name="notes" rows={3} defaultValue={contact?.notes ?? ""} /></Field></div>
}

export function ClientArchiveControl({ clientId, archived, isAdmin }: { clientId: string; archived: boolean; isAdmin: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(archiveClient, null)
  useFeedback(state)
  if (!isAdmin) return null
  return <details className="rounded-xl border border-dashed p-4"><summary className="text-sm font-medium">{archived ? "Restaurar cliente" : "Archivar cliente"}</summary><form action={action} className="mt-3 flex flex-col gap-3 sm:flex-row"><input type="hidden" name="client_id" value={clientId} /><input type="hidden" name="restore" value={archived ? "true" : "false"} />{!archived && <Input name="reason" required placeholder="Motivo del archivado" />}<Button type="submit" variant="outline" disabled={pending}><Archive className="mr-1 size-4" />{pending ? "Guardando…" : archived ? "Restaurar" : "Archivar"}</Button></form>{state && "error" in state && <p className="mt-2 text-sm text-destructive">{state.error}</p>}</details>
}

export function ClientConversationPanel({ clientId, conversations, profiles }: { clientId: string; conversations: { id: string; title: string; status: string; last_message_at: string }[]; profiles: { id: string; full_name: string }[] }) {
  const [state, action, pending] = useActionState<ActionResult<{ conversationId: string }> | null, FormData>(createTeamConversation, null)
  useFeedback(state)
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]"><Card className="gap-0 overflow-hidden py-0">{conversations.length === 0 ? <div className="p-10 text-center"><MessageSquare className="mx-auto size-8 text-muted-foreground/40" /><p className="mt-3 text-sm text-muted-foreground">Sin conversaciones internas para este cliente.</p></div> : conversations.map((conversation) => <Link key={conversation.id} href={`/bandeja?tab=equipo&conversation=${conversation.id}`} className="flex items-center justify-between gap-4 border-b px-5 py-4 hover:bg-muted/40"><div><p className="text-sm font-medium">{conversation.title}</p><p className="label-mono mt-1 text-muted-foreground">{conversation.status}</p></div><MessageSquare className="size-4 text-muted-foreground" /></Link>)}</Card><Card className="gap-0 p-5"><p className="label-mono text-primary">Nueva conversación</p><form action={action} className="mt-4 space-y-3"><input type="hidden" name="client_id" value={clientId} /><Field label="Asunto"><Input name="title" required /></Field><Field label="Mensaje"><Textarea name="body" rows={4} required placeholder="Podés mencionar @equipo" /></Field><Field label="Le toca a"><Select name="assigned_to" items={Object.fromEntries(profiles.map((profile) => [profile.id, profile.full_name]))}><SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger><SelectContent>{profiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.full_name}</SelectItem>)}</SelectContent></Select></Field>{state && "error" in state && <p className="text-sm text-destructive">{state.error}</p>}<Button type="submit" disabled={pending}><MessageSquare className="mr-1 size-4" />{pending ? "Enviando…" : "Abrir conversación"}</Button></form></Card></div>
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <div className={wide ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}><Label>{label}</Label>{children}</div>
}
