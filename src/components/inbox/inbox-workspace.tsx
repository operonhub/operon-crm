"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Archive,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  Inbox,
  MessageSquare,
  Plus,
  Reply,
  Send,
  Sparkles,
  UserRoundCheck,
} from "lucide-react"
import { toast } from "sonner"
import {
  createDecision,
  createTaskFromConversation,
  createTeamConversation,
  handoffConversation,
  markConversationRead,
  markNotificationRead,
  replyTeamConversation,
  requestConversationReview,
  setConversationStatus,
} from "@/app/(app)/bandeja/actions"
import type { ActionResult } from "@/lib/action-result"
import { isConversationUnread } from "@/lib/collaboration"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

type Person = { full_name: string } | null
type Conversation = {
  id: string
  title: string
  channel: string
  status: "open" | "resolved" | "archived"
  context_type: string
  assigned_to: string | null
  last_message_at: string
  created_at: string
  client_id: string | null
  opportunity_id: string | null
  project_id: string | null
  task_id: string | null
  financial_record_id: string | null
  agent_id: string | null
  assigned: Person
  creator: Person
  participants: { profile_id: string; last_read_at: string | null }[]
  client: { organization: { name: string } | null } | null
  opportunity: { title: string } | null
  project: { name: string } | null
  task: { title: string } | null
  finance: { concept: string } | null
  agent: { name: string } | null
}

type Message = {
  id: string
  body: string
  message_kind: string
  created_at: string
  author_id: string
  author: Person
}

type Notification = {
  id: string
  notification_type: string
  title: string
  body: string | null
  href: string | null
  read_at: string | null
  created_at: string
  actor: Person
}

type CollaborationEvent = {
  id: string
  note: string | null
  status: string
  created_at: string
  from?: Person
  to?: Person
  requester?: Person
  reviewer?: Person
}

type Decision = {
  id: string
  title: string
  body: string | null
  decided_at: string
  decided_by: string
  profile: Person
}

type Profile = { id: string; full_name: string; role: string }
type Project = { id: string; name: string }

function contextLabel(conversation: Conversation): string {
  return (
    conversation.client?.organization?.name ??
    conversation.opportunity?.title ??
    conversation.project?.name ??
    conversation.task?.title ??
    conversation.finance?.concept ??
    conversation.agent?.name ??
    "Equipo Operon"
  )
}

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export function InboxWorkspace({
  currentProfileId,
  tab,
  statusFilter,
  assignedFilter,
  conversations,
  selectedId,
  messages,
  decisions,
  handoffs,
  reviews,
  notifications,
  profiles,
  projects,
}: {
  currentProfileId: string
  tab: "equipo" | "clientes" | "sistema"
  statusFilter: string
  assignedFilter: string
  conversations: Conversation[]
  selectedId: string | null
  messages: Message[]
  decisions: Decision[]
  handoffs: CollaborationEvent[]
  reviews: CollaborationEvent[]
  notifications: Notification[]
  profiles: Profile[]
  projects: Project[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [newOpen, setNewOpen] = useState(false)

  async function run(action: Promise<ActionResult>, success?: string) {
    const result = await action
    if ("error" in result) {
      toast.error(result.error)
      return false
    }
    if (success || result.message) toast.success(result.message ?? success)
    router.refresh()
    return true
  }

  const selected = conversations.find((item) => item.id === selectedId) ?? null
  const filtered = useMemo(
    () =>
      conversations.filter((conversation) => {
        const participant = conversation.participants.find(
          (item) => item.profile_id === currentProfileId
        )
        const unread = isConversationUnread(
          conversation.last_message_at,
          participant?.last_read_at ?? null
        )
        if (statusFilter === "unread" && !unread) return false
        if (statusFilter !== "all" && statusFilter !== "unread" && conversation.status !== statusFilter) {
          return false
        }
        if (assignedFilter === "mine" && conversation.assigned_to !== currentProfileId) {
          return false
        }
        return true
      }),
    [assignedFilter, conversations, currentProfileId, statusFilter]
  )

  useEffect(() => {
    if (!selected) return
    const participant = selected.participants.find(
      (item) => item.profile_id === currentProfileId
    )
    if (!isConversationUnread(selected.last_message_at, participant?.last_read_at ?? null)) {
      return
    }
    startTransition(async () => {
      await markConversationRead(selected.id)
      router.refresh()
    })
  }, [currentProfileId, router, selected])

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="label-mono text-primary">Comunicación y sistemas</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">Bandeja</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Conversaciones internas, traspasos, revisiones y notificaciones reales.
          </p>
        </div>
        {tab === "equipo" && (
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="mr-1 size-4" /> Nuevo mensaje
          </Button>
        )}
      </div>

      <div className="mb-4 flex w-full gap-1 overflow-x-auto rounded-xl border bg-card p-1 sm:w-fit">
        <TabLink active={tab === "equipo"} href="/bandeja?tab=equipo" icon={MessageSquare}>
          Equipo
        </TabLink>
        <TabLink active={tab === "clientes"} href="/bandeja?tab=clientes" icon={Inbox}>
          Clientes
        </TabLink>
        <TabLink active={tab === "sistema"} href="/bandeja?tab=sistema" icon={Bell}>
          Sistema
        </TabLink>
      </div>

      {tab === "clientes" ? (
        <FutureClientInbox />
      ) : tab === "sistema" ? (
        <SystemNotifications notifications={notifications} pending={pending} run={run} />
      ) : (
        <div className="grid min-h-[calc(100dvh-15rem)] overflow-hidden rounded-2xl border bg-card shadow-sm lg:grid-cols-[22rem_minmax(0,1fr)]">
          <aside className="border-b lg:border-b-0 lg:border-r">
            <div className="grid grid-cols-2 gap-2 border-b p-3">
              <Select
                value={statusFilter}
                onValueChange={(value) =>
                  router.push(`/bandeja?tab=equipo&status=${value}&assigned=${assignedFilter}`)
                }
                items={{ open: "Abiertas", unread: "Sin leer", resolved: "Resueltas", archived: "Archivadas", all: "Todas" }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Abiertas</SelectItem>
                  <SelectItem value="unread">Sin leer</SelectItem>
                  <SelectItem value="resolved">Resueltas</SelectItem>
                  <SelectItem value="archived">Archivadas</SelectItem>
                  <SelectItem value="all">Todas</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={assignedFilter}
                onValueChange={(value) =>
                  router.push(`/bandeja?tab=equipo&status=${statusFilter}&assigned=${value}`)
                }
                items={{ all: "Todo el equipo", mine: "Me toca" }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todo el equipo</SelectItem>
                  <SelectItem value="mine">Me toca</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="max-h-[28rem] overflow-y-auto lg:max-h-[calc(100dvh-19rem)]">
              {filtered.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <CheckCircle2 className="mx-auto size-8 text-success" />
                  <p className="mt-3 font-heading text-sm font-semibold">Nada pendiente</p>
                  <p className="mt-1 text-xs text-muted-foreground">Probá otro filtro o abrí una conversación.</p>
                </div>
              ) : (
                filtered.map((conversation) => {
                  const participant = conversation.participants.find(
                    (item) => item.profile_id === currentProfileId
                  )
                  const unread = isConversationUnread(
                    conversation.last_message_at,
                    participant?.last_read_at ?? null
                  )
                  return (
                    <Link
                      key={conversation.id}
                      href={`/bandeja?tab=equipo&status=${statusFilter}&assigned=${assignedFilter}&conversation=${conversation.id}`}
                      className={cn(
                        "block border-b px-4 py-3.5 transition-colors hover:bg-muted/45 focus-visible:bg-muted/45 focus-visible:outline-none",
                        selectedId === conversation.id && "bg-accent/65"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <CircleDot className={cn("mt-1 size-3 shrink-0", unread ? "fill-primary text-primary" : "text-muted-foreground/40")} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className={cn("truncate text-sm", unread && "font-semibold")}>{conversation.title}</p>
                            <span className="label-mono shrink-0 text-muted-foreground">{timeLabel(conversation.last_message_at).split(",")[0]}</span>
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{contextLabel(conversation)}</p>
                          {conversation.assigned && (
                            <p className="label-mono mt-2 text-primary">Le toca a {conversation.assigned.full_name}</p>
                          )}
                        </div>
                      </div>
                    </Link>
                  )
                })
              )}
            </div>
          </aside>

          {selected ? (
            <ConversationDetail
              conversation={selected}
              messages={messages}
              decisions={decisions}
              handoffs={handoffs}
              reviews={reviews}
              profiles={profiles}
              projects={projects}
              pending={pending}
              run={run}
              startTransition={startTransition}
            />
          ) : (
            <div className="flex min-h-96 flex-col items-center justify-center p-8 text-center">
              <MessageSquare className="size-10 text-muted-foreground/40" />
              <p className="mt-4 font-heading font-semibold">Elegí una conversación</p>
              <p className="mt-1 text-sm text-muted-foreground">El contexto y las acciones aparecen acá.</p>
            </div>
          )}
        </div>
      )}

      <NewConversationDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        profiles={profiles}
        pending={pending}
        onSubmit={(fd) =>
          startTransition(async () => {
            const result = await createTeamConversation(null, fd)
            if ("error" in result) {
              toast.error(result.error)
              return
            }
            toast.success(result.message ?? "Conversación creada")
            setNewOpen(false)
            router.push(`/bandeja?tab=equipo&conversation=${result.data?.conversationId}`)
            router.refresh()
          })
        }
      />
    </div>
  )
}

function TabLink({
  active,
  href,
  icon: Icon,
  children,
}: {
  active: boolean
  href: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-w-max items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="size-4" /> {children}
    </Link>
  )
}

function ConversationDetail({
  conversation,
  messages,
  decisions,
  handoffs,
  reviews,
  profiles,
  projects,
  pending,
  run,
  startTransition,
}: {
  conversation: Conversation
  messages: Message[]
  decisions: Decision[]
  handoffs: CollaborationEvent[]
  reviews: CollaborationEvent[]
  profiles: Profile[]
  projects: Project[]
  pending: boolean
  run: (action: Promise<ActionResult>, success?: string) => Promise<boolean>
  startTransition: React.TransitionStartFunction
}) {
  const [coordinationOpen, setCoordinationOpen] = useState(false)
  return (
    <section className="flex min-h-0 flex-col">
      <header className="border-b px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-semibold">{conversation.title}</h2>
              <Badge variant="outline">{conversation.status === "open" ? "Abierta" : conversation.status === "resolved" ? "Resuelta" : "Archivada"}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{contextLabel(conversation)} · iniciada por {conversation.creator?.full_name ?? "Equipo"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setCoordinationOpen((value) => !value)}>
              <UserRoundCheck className="mr-1 size-4" /> Coordinar
            </Button>
            {conversation.status === "open" ? (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => startTransition(async () => { await run(setConversationStatus(conversation.id, "resolved")) })}
              >
                <Check className="mr-1 size-4" /> Resolver
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => startTransition(async () => { await run(setConversationStatus(conversation.id, "open")) })}
              >
                Reabrir
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => startTransition(async () => { await run(setConversationStatus(conversation.id, "archived")) })}
            >
              <Archive className="mr-1 size-4" /> Archivar
            </Button>
          </div>
        </div>
      </header>

      {coordinationOpen && (
        <div className="grid gap-4 border-b bg-muted/20 p-4 xl:grid-cols-3">
          <SimpleForm
            title="Te toca"
            submit="Transferir"
            pending={pending}
            onSubmit={(fd) => {
              fd.set("conversation_id", conversation.id)
              startTransition(async () => { await run(handoffConversation(null, fd)) })
            }}
          >
            <ProfileSelect name="to_profile_id" profiles={profiles} placeholder="Elegí persona" />
            <Input name="note" placeholder="Contexto del traspaso" />
          </SimpleForm>
          <SimpleForm
            title="Pedir revisión"
            submit="Solicitar"
            pending={pending}
            onSubmit={(fd) => {
              fd.set("conversation_id", conversation.id)
              startTransition(async () => { await run(requestConversationReview(null, fd)) })
            }}
          >
            <ProfileSelect name="requested_from" profiles={profiles} placeholder="Quién revisa" />
            <Input name="note" placeholder="Qué necesita revisión" />
          </SimpleForm>
          <SimpleForm
            title="Registrar decisión"
            submit="Registrar"
            pending={pending}
            onSubmit={(fd) => {
              fd.set("conversation_id", conversation.id)
              startTransition(async () => { await run(createDecision(null, fd)) })
            }}
          >
            <Input name="title" required placeholder="Decisión tomada" />
            <Input name="body" placeholder="Motivo o alcance" />
          </SimpleForm>
        </div>
      )}

      <div className="min-h-72 flex-1 space-y-4 overflow-y-auto bg-muted/10 p-4 sm:p-6">
        {messages.map((message) => (
          <article key={message.id} className="max-w-3xl rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="font-heading text-sm font-semibold">{message.author?.full_name ?? "Sistema"}</p>
              <time className="label-mono text-muted-foreground">{timeLabel(message.created_at)}</time>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
          </article>
        ))}

        {(decisions.length > 0 || handoffs.length > 0 || reviews.length > 0) && (
          <div className="grid gap-3 xl:grid-cols-3">
            {decisions.slice(0, 3).map((decision) => (
              <Card key={decision.id} className="gap-1 border-primary/25 p-4">
                <p className="label-mono text-primary">Decisión</p>
                <p className="text-sm font-medium">{decision.title}</p>
                <p className="text-xs text-muted-foreground">{decision.profile?.full_name ?? "Equipo"}</p>
              </Card>
            ))}
            {handoffs.slice(0, 2).map((handoff) => (
              <Card key={handoff.id} className="gap-1 p-4">
                <p className="label-mono text-muted-foreground">Traspaso · {handoff.status}</p>
                <p className="text-sm">{handoff.from?.full_name} → {handoff.to?.full_name}</p>
              </Card>
            ))}
            {reviews.slice(0, 2).map((review) => (
              <Card key={review.id} className="gap-1 p-4">
                <p className="label-mono text-muted-foreground">Revisión · {review.status}</p>
                <p className="text-sm">{review.requester?.full_name} → {review.reviewer?.full_name}</p>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="border-t bg-card p-4">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const form = event.currentTarget
            const fd = new FormData(form)
            fd.set("conversation_id", conversation.id)
            startTransition(async () => {
              if (await run(replyTeamConversation(null, fd), "Respuesta enviada")) form.reset()
            })
          }}
          className="flex items-end gap-2"
        >
          <Textarea name="body" required rows={2} placeholder="Respondé o mencioná @equipo" className="min-h-10" />
          <Button type="submit" disabled={pending} aria-label="Enviar respuesta">
            <Reply className="size-4" />
          </Button>
        </form>
        {projects.length > 0 && (
          <details className="mt-3">
            <summary className="label-mono text-muted-foreground">Convertir en tarea</summary>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                const form = event.currentTarget
                const fd = new FormData(form)
                fd.set("conversation_id", conversation.id)
                startTransition(async () => {
                  if (await run(createTaskFromConversation(null, fd))) form.reset()
                })
              }}
              className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]"
            >
              <Input name="title" required placeholder="Título de tarea" />
              <Select name="project_id" required items={Object.fromEntries(projects.map((project) => [project.id, project.name]))}>
                <SelectTrigger><SelectValue placeholder="Proyecto" /></SelectTrigger>
                <SelectContent>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input name="due_date" type="date" />
              <Button type="submit" variant="outline" disabled={pending}><ClipboardCheck className="size-4" /></Button>
            </form>
          </details>
        )}
      </div>
    </section>
  )
}

function SimpleForm({ title, submit, pending, onSubmit, children }: { title: string; submit: string; pending: boolean; onSubmit: (fd: FormData) => void; children: React.ReactNode }) {
  return (
    <form action={onSubmit} className="space-y-2 rounded-xl border bg-card p-3">
      <p className="label-mono text-muted-foreground">{title}</p>
      {children}
      <Button type="submit" size="sm" variant="outline" disabled={pending}>{submit}</Button>
    </form>
  )
}

function ProfileSelect({ name, profiles, placeholder }: { name: string; profiles: Profile[]; placeholder: string }) {
  return (
    <Select name={name} required items={Object.fromEntries(profiles.map((profile) => [profile.id, profile.full_name]))}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>{profiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.full_name}</SelectItem>)}</SelectContent>
    </Select>
  )
}

function NewConversationDialog({ open, onOpenChange, profiles, pending, onSubmit }: { open: boolean; onOpenChange: (open: boolean) => void; profiles: Profile[]; pending: boolean; onSubmit: (fd: FormData) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo mensaje de Equipo</DialogTitle>
          <DialogDescription>Menciones válidas: nombres de perfiles y @equipo.</DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="inbox-title">Asunto</Label><Input id="inbox-title" name="title" required autoFocus /></div>
          <div className="space-y-1.5"><Label htmlFor="inbox-body">Mensaje</Label><Textarea id="inbox-body" name="body" required rows={5} /></div>
          <div className="space-y-1.5"><Label>Le toca a</Label><ProfileSelect name="assigned_to" profiles={profiles} placeholder="Sin asignar" /></div>
          <DialogFooter><Button type="submit" disabled={pending}><Send className="mr-1 size-4" />{pending ? "Enviando…" : "Enviar"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FutureClientInbox() {
  return (
    <Card className="flex min-h-[28rem] flex-col items-center justify-center border-dashed p-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><Inbox className="size-5" /></span>
      <p className="mt-4 font-heading text-lg font-semibold">Mensajería con clientes, próximamente</p>
      <p className="mt-2 max-w-lg text-sm text-muted-foreground">Este CRM todavía no conecta WhatsApp, Instagram ni email. Cuando exista una integración real, las conversaciones externas van a vivir acá; hoy no mostramos canales simulados.</p>
    </Card>
  )
}

function SystemNotifications({ notifications, pending, run }: { notifications: Notification[]; pending: boolean; run: (action: Promise<ActionResult>, success?: string) => Promise<boolean> }) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      {notifications.length === 0 ? (
        <div className="flex min-h-80 flex-col items-center justify-center p-8 text-center"><Sparkles className="size-9 text-success" /><p className="mt-4 font-heading font-semibold">Sin notificaciones</p><p className="mt-1 text-sm text-muted-foreground">Las menciones, revisiones y aprobaciones reales aparecen acá.</p></div>
      ) : notifications.map((notification, index) => (
        <div key={notification.id} className={cn("flex items-start gap-3 px-4 py-4", index > 0 && "border-t", !notification.read_at && "bg-accent/35")}>
          <Bell className={cn("mt-0.5 size-4 shrink-0", notification.read_at ? "text-muted-foreground" : "text-primary")} />
          <div className="min-w-0 flex-1"><p className="text-sm font-medium">{notification.title}</p>{notification.body && <p className="mt-1 text-sm text-muted-foreground">{notification.body}</p>}<p className="label-mono mt-2 text-muted-foreground">{notification.actor?.full_name ?? "Sistema"} · {timeLabel(notification.created_at)}</p></div>
          <div className="flex shrink-0 gap-1">{notification.href && <Button variant="ghost" size="icon-sm" render={<Link href={notification.href} aria-label="Abrir notificación" />}><ArrowRight className="size-4" /></Button>}<Button variant="ghost" size="icon-sm" disabled={pending} aria-label={notification.read_at ? "Marcar no leída" : "Marcar leída"} onClick={() => run(markNotificationRead(notification.id, !notification.read_at))}><Check className="size-4" /></Button></div>
        </div>
      ))}
    </Card>
  )
}
