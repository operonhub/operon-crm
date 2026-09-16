"use client"

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition, ViewTransition } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  CircleSlash,
  Clock3,
  DownloadCloud,
  ImageIcon,
  MessageCircle,
  Paperclip,
  Phone,
  Search,
  Send,
  UserPlus,
} from "lucide-react"
import { toast } from "sonner"
import { backfillSocialInbox } from "@/app/(app)/bandeja/backfill-actions"
import {
  convertConversationToLead,
  markSocialConversationRead,
  sendSocialMessage,
  setSocialConversationStatus,
} from "@/app/(app)/bandeja/social-actions"
import { PlatformIcon } from "@/components/brand/social-icons"
import { EmptyState } from "@/components/shell/empty-state"
import { UrlTabs } from "@/components/shell/url-tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import type { ActionResult } from "@/lib/action-result"
import {
  avatarTone,
  groupThread,
  initials,
  isPhoneLike,
  placeholderKind,
  readAttachments,
  timeOfDay,
  type ThreadMessage,
} from "@/lib/inbox/thread"
import { ENTER_SOFT } from "@/lib/motion"
import { messagingWindow } from "@/lib/zernio/events"
import { platformLabel } from "@/lib/zernio/types"
import { cn } from "@/lib/utils"

export type SocialConversation = {
  id: string
  platform: string
  participant_name: string | null
  participant_handle: string | null
  participant_avatar_url?: string | null
  status: string
  unread_count: number
  last_message_at: string | null
  last_message_preview: string | null
  last_inbound_at: string | null
  lead_id: string | null
  account: { username: string | null; display_name: string | null; is_active: boolean } | null
}

export type SocialMessage = ThreadMessage

const CHANNELS = [
  { value: "todos", label: "Todos" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
] as const

const OPTIMISTIC_PREFIX = "optimista:"

function relativeTime(value: string | null, now: number): string {
  if (!value) return ""
  const minutes = Math.round((now - new Date(value).getTime()) / 60_000)
  if (minutes < 1) return "ahora"
  if (minutes < 60) return `${minutes} min`
  if (minutes < 1440) return `${Math.round(minutes / 60)} h`
  return new Date(value).toLocaleDateString("es-AR", { day: "numeric", month: "short" })
}

function displayName(c: Pick<SocialConversation, "participant_name" | "participant_handle">) {
  return c.participant_name ?? c.participant_handle ?? "Sin nombre"
}

/**
 * Fondos de avatar con la paleta de marca; el texto queda en tinta para que se
 * lea. Sin rojo: en un chat se leería como error o como urgente.
 */
const AVATAR_BG = [
  "bg-primary/15",
  "bg-warning/35",
  "bg-success/20",
  "bg-chart-4/20",
  "bg-chart-5/25",
] as const

function ContactAvatar({
  conversation,
  size = "default",
}: {
  conversation: SocialConversation
  size?: "default" | "lg"
}) {
  return (
    <span className="relative inline-flex shrink-0 self-start">
      <Avatar size={size}>
        {conversation.participant_avatar_url && (
          <AvatarImage src={conversation.participant_avatar_url} alt="" referrerPolicy="no-referrer" />
        )}
        <AvatarFallback
          className={cn("font-heading text-xs font-semibold text-foreground/80", AVATAR_BG[avatarTone(displayName(conversation))])}
        >
          {isPhoneLike(conversation.participant_name) ? (
            <Phone className="size-3.5" aria-hidden="true" />
          ) : (
            initials(displayName(conversation))
          )}
        </AvatarFallback>
      </Avatar>
      {/* La red va sobre el avatar, como en el celular: se reconoce de un vistazo. */}
      <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-card ring-2 ring-card">
        <PlatformIcon platform={conversation.platform} colored className="size-3" />
      </span>
    </span>
  )
}

function DeliveryTick({ status }: { status: string }) {
  if (status === "pending")
    return <Clock3 className="size-3 opacity-70" aria-label="Enviando" />
  if (status === "failed")
    return <AlertTriangle className="size-3 text-destructive" aria-label="No se entregó" />
  if (status === "read")
    return <CheckCheck className="size-3.5 text-warning" aria-label="Leído" />
  if (status === "delivered")
    return <CheckCheck className="size-3.5 opacity-70" aria-label="Entregado" />
  return <Check className="size-3.5 opacity-70" aria-label="Enviado" />
}

function MessageContent({ message, outbound }: { message: SocialMessage; outbound: boolean }) {
  if (message.deleted_at) {
    return (
      <p className="flex items-center gap-1.5 text-sm italic opacity-70">
        <CircleSlash className="size-3.5" aria-hidden="true" /> Mensaje eliminado
      </p>
    )
  }

  const attachments = readAttachments(message.attachments)
  const placeholder = placeholderKind(message.body)
  const text = placeholder ? null : message.body

  return (
    <>
      {attachments.map((attachment, index) =>
        attachment.kind === "image" && attachment.url ? (
          <a
            key={index}
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-1.5 block overflow-hidden rounded-xl"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- URLs firmadas y efímeras del CDN de Meta. */}
            <img
              src={attachment.url}
              alt="Imagen adjunta"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="max-h-64 w-full object-cover"
            />
          </a>
        ) : (
          <a
            key={index}
            href={attachment.url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "mb-1.5 flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs",
              outbound ? "bg-primary-foreground/15" : "bg-background/70",
              !attachment.url && "pointer-events-none"
            )}
          >
            {attachment.kind === "image" ? (
              <ImageIcon className="size-4 shrink-0" aria-hidden="true" />
            ) : (
              <Paperclip className="size-4 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">{attachment.name ?? `Adjunto (${attachment.kind})`}</span>
          </a>
        )
      )}

      {text && <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{text}</p>}

      {placeholder === "unsupported" && (
        <p className="text-xs italic opacity-80">
          Tipo de mensaje que la plataforma no comparte (sticker, encuesta, ubicación en vivo).
          Miralo en el celular.
        </p>
      )}
      {placeholder === "attachment" && attachments.length === 0 && (
        <p className="flex items-center gap-1.5 text-xs italic opacity-80">
          <Paperclip className="size-3.5" aria-hidden="true" /> Adjunto que la plataforma no expone
        </p>
      )}
    </>
  )
}

/**
 * Bandeja de clientes: WhatsApp e Instagram en el mismo panel.
 *
 * Lo que cambió respecto de la primera versión, y por qué:
 * - **Sin recargar la página entera.** Enviar agrega el mensaje al instante con
 *   `useOptimistic`, y marcar leído también es optimista. Las server actions ya
 *   revalidan `/bandeja` en su propia respuesta, así que el `router.refresh()`
 *   que había después era un segundo viaje completo innecesario.
 * - **Leer cómodo.** Separadores por día, mensajes seguidos del mismo lado
 *   pegados, hora sólo en el último del grupo, tildes de entrega, adjuntos
 *   visibles y aviso claro cuando la plataforma no comparte el contenido.
 * - **Escribir cómodo.** Enter envía y Shift+Enter baja de línea; el cuadro
 *   crece con el texto.
 * - **Móvil.** Un panel por vez con botón de volver.
 */
export function SocialInbox({
  conversations,
  messages,
  selectedId,
  channel,
  configured,
  notConfiguredReason,
  isAdmin,
  explicitSelection,
}: {
  conversations: SocialConversation[]
  messages: SocialMessage[]
  selectedId: string | null
  channel: string
  configured: boolean
  notConfiguredReason: string | null
  isAdmin: boolean
  /** La URL trae `?conversation=`: el usuario eligió un chat (y no lo auto-seleccionó la página). */
  explicitSelection: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState("")
  const [query, setQuery] = useState("")
  const [scrolledUp, setScrolledUp] = useState(false)
  const [now] = useState(() => Date.now())
  const threadRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  const [optimisticMessages, addOptimisticMessage] = useOptimistic(
    messages,
    (state: SocialMessage[], message: SocialMessage) => [...state, message]
  )
  const [readIds, markReadOptimistic] = useOptimistic(
    new Set<string>(),
    (state: Set<string>, id: string) => new Set(state).add(id)
  )

  const selected = useMemo(
    () => conversations.find((item) => item.id === selectedId) ?? null,
    [conversations, selectedId]
  )

  const visibleConversations = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) =>
      [c.participant_name, c.participant_handle].some((v) => v?.toLowerCase().includes(q))
    )
  }, [conversations, query])

  const groups = useMemo(() => groupThread(optimisticMessages), [optimisticMessages])

  // Al abrir un chat, marcarlo leído. Sólo si realmente está a la vista: en el
  // celular la página auto-selecciona el primero pero muestra la lista, y
  // marcarlo leído ahí escondería un mensaje que nadie vio.
  useEffect(() => {
    if (!selected || selected.unread_count === 0) return
    const visible = explicitSelection || window.matchMedia("(min-width: 1024px)").matches
    if (!visible) return
    const id = selected.id
    startTransition(async () => {
      markReadOptimistic(id)
      await markSocialConversationRead(id)
    })
  }, [selected, explicitSelection, markReadOptimistic])

  // Al cambiar de chat, arrancar abajo de todo: lo último es lo que importa.
  useEffect(() => {
    const node = threadRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [selectedId])

  // Al llegar un mensaje nuevo, seguir el hilo sólo si ya estaba abajo: si el
  // usuario subió a leer algo viejo, no se lo arrancamos de las manos.
  useEffect(() => {
    const node = threadRef.current
    if (!node || scrolledUp) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    node.scrollTo({ top: node.scrollHeight, behavior: reduce ? "auto" : "smooth" })
  }, [optimisticMessages.length, scrolledUp])

  function onThreadScroll() {
    const node = threadRef.current
    if (!node) return
    setScrolledUp(node.scrollHeight - node.scrollTop - node.clientHeight > 120)
  }

  function jumpToLatest() {
    const node = threadRef.current
    if (!node) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    node.scrollTo({ top: node.scrollHeight, behavior: reduce ? "auto" : "smooth" })
  }

  function run(action: () => Promise<ActionResult<unknown>>, success?: string) {
    startTransition(async () => {
      const result = await action()
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? success ?? "Listo.")
    })
  }

  function autosize() {
    const node = composerRef.current
    if (!node) return
    node.style.height = "auto"
    node.style.height = `${Math.min(node.scrollHeight, 168)}px`
  }

  function send() {
    const text = draft.trim()
    if (!selected || !text || pending) return
    setDraft("")
    requestAnimationFrame(autosize)
    const conversationId = selected.id
    startTransition(async () => {
      addOptimisticMessage({
        id: `${OPTIMISTIC_PREFIX}${crypto.randomUUID()}`,
        direction: "outbound",
        body: text,
        attachments: null,
        delivery_status: "pending",
        sent_at: new Date().toISOString(),
        deleted_at: null,
        sender: null,
      })
      const result = await sendSocialMessage(conversationId, text)
      if ("error" in result) {
        toast.error(result.error)
        // El texto no se pierde: vuelve al cuadro para reintentar.
        setDraft(text)
      }
    })
  }

  if (!configured) {
    return (
      <EmptyState
        icon={<MessageCircle />}
        title="Falta conectar WhatsApp e Instagram"
        description={notConfiguredReason ?? "La integración con Zernio no está configurada."}
        action={
          <Button variant="outline" size="sm" nativeButton={false}
                    render={<Link href="/ajustes/conexiones" />}>
            Ir a Conexiones <ArrowRight className="ml-1 size-4" />
          </Button>
        }
      />
    )
  }

  const window24 = selected
    ? messagingWindow(selected.platform, selected.last_inbound_at)
    : ({ state: "not_applicable" } as const)
  const showThreadOnMobile = explicitSelection && selected !== null
  const listHref = `/bandeja?tab=chats&canal=${channel}`

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <UrlTabs
          id="bandeja-canal"
          size="sm"
          active={channel}
          tabs={CHANNELS.map((item) => ({
            value: item.value,
            label: item.label,
            href: `/bandeja?tab=chats&canal=${item.value}`,
            icon: item.value === "todos" ? undefined : <PlatformIcon platform={item.value} colored className="size-3.5" />,
          }))}
        />
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => run(backfillSocialInbox)}
          >
            <DownloadCloud className="mr-1 size-4" aria-hidden="true" />
            Importar historial
          </Button>
        )}
      </div>

      <div className="grid h-[calc(100dvh-15rem)] min-h-[28rem] overflow-hidden rounded-2xl border bg-card shadow-sm lg:grid-cols-[22rem_minmax(0,1fr)]">
        {/* ---------------- Lista ---------------- */}
        <aside
          className={cn(
            "min-h-0 flex-col border-b lg:flex lg:border-r lg:border-b-0",
            showThreadOnMobile ? "hidden" : "flex"
          )}
        >
          <div className="border-b p-2.5">
            <label className="relative block">
              <span className="sr-only">Buscar conversación</span>
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre o usuario"
                className="h-9 w-full rounded-lg border bg-background pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {visibleConversations.length === 0 ? (
              <EmptyState
                size="sm"
                className="m-3 border-0 bg-transparent"
                title={query ? "Sin resultados" : "Sin conversaciones"}
                description={
                  query
                    ? `Nadie coincide con "${query}".`
                    : `Cuando alguien escriba por ${channel === "todos" ? "WhatsApp o Instagram" : platformLabel(channel)}, el chat aparece acá.`
                }
              />
            ) : (
              <ul>
                {visibleConversations.map((item) => {
                  const unread = item.unread_count > 0 && !readIds.has(item.id)
                  const active = item.id === selectedId
                  return (
                    <li key={item.id}>
                      <Link
                        href={`${listHref}&conversation=${item.id}`}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "relative flex gap-3 px-3.5 py-3 transition-colors duration-150 outline-none hover:bg-muted/60 focus-visible:bg-muted/60",
                          active && "bg-accent/60 hover:bg-accent/60"
                        )}
                      >
                        {active && (
                          <span aria-hidden="true" className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" />
                        )}
                        <ContactAvatar conversation={item} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium")}>
                              {displayName(item)}
                            </p>
                            <span
                              className={cn(
                                "shrink-0 font-mono text-[10px] tabular-nums",
                                unread ? "font-semibold text-primary" : "text-muted-foreground"
                              )}
                            >
                              {relativeTime(item.last_message_at, now)}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2">
                            <p
                              className={cn(
                                "min-w-0 flex-1 truncate text-xs",
                                unread ? "text-foreground" : "text-muted-foreground"
                              )}
                            >
                              {placeholderKind(item.last_message_preview)
                                ? "Adjunto o mensaje no soportado"
                                : (item.last_message_preview ?? "Sin mensajes")}
                            </p>
                            {unread && (
                              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] font-semibold text-primary-foreground tabular-nums">
                                {item.unread_count > 99 ? "99+" : item.unread_count}
                              </span>
                            )}
                          </div>
                          {(item.lead_id || item.status === "resolved") && (
                            <div className="mt-1.5 flex gap-1.5">
                              {item.lead_id && <StatusBadge tone="deep">lead</StatusBadge>}
                              {item.status === "resolved" && <StatusBadge tone="success">resuelta</StatusBadge>}
                            </div>
                          )}
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* ---------------- Hilo ---------------- */}
        <section
          className={cn(
            "relative min-h-0 min-w-0 flex-col lg:flex",
            showThreadOnMobile ? "flex" : "hidden"
          )}
        >
          {!selected ? (
            <div className="flex flex-1 items-center justify-center p-8">
              <EmptyState
                size="sm"
                className="border-0 bg-transparent"
                icon={<MessageCircle />}
                title="Elegí una conversación"
                description="Los chats de WhatsApp e Instagram aparecen en la lista de la izquierda."
              />
            </div>
          ) : (
            <ViewTransition key={selected.id} enter="fade-in" exit="fade-out" default="none">
              <div className="flex min-h-0 flex-1 flex-col">
                <header className="flex items-center gap-3 border-b px-3 py-3 sm:px-5">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="lg:hidden"
                    aria-label="Volver a la lista"
                    nativeButton={false}
                    render={<Link href={listHref} />}
                  >
                    <ArrowLeft className="size-4" />
                  </Button>
                  <ContactAvatar conversation={selected} size="lg" />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-heading text-base font-semibold">{displayName(selected)}</h2>
                    <p className="label-mono truncate text-muted-foreground">
                      {platformLabel(selected.platform)}
                      {selected.participant_handle ? ` · @${selected.participant_handle}` : ""}
                      {selected.account?.username ? ` → ${selected.account.username}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {selected.lead_id ? (
                      <Button size="sm" variant="ghost" nativeButton={false}
                    render={<Link href={`/leads/${selected.lead_id}`} />}>
                        <span className="hidden sm:inline">Ver lead</span>
                        <ArrowRight className="size-4 sm:ml-1" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => run(() => convertConversationToLead(selected.id))}
                        aria-label="Convertir en lead"
                      >
                        <UserPlus className="size-4 sm:mr-1" />
                        <span className="hidden sm:inline">Convertir en lead</span>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          setSocialConversationStatus(
                            selected.id,
                            selected.status === "resolved" ? "open" : "resolved"
                          )
                        )
                      }
                      aria-label={selected.status === "resolved" ? "Reabrir" : "Resolver"}
                    >
                      <Check className="size-4 sm:mr-1" />
                      <span className="hidden sm:inline">
                        {selected.status === "resolved" ? "Reabrir" : "Resolver"}
                      </span>
                    </Button>
                  </div>
                </header>

                <div
                  ref={threadRef}
                  onScroll={onThreadScroll}
                  className="min-h-0 flex-1 overflow-y-auto bg-muted/25 px-3 py-4 sm:px-6"
                >
                  {groups.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      Todavía no hay mensajes en este hilo.
                    </p>
                  ) : (
                    groups.map((group) => (
                      <div key={group.key} className="space-y-0.5">
                        <div className="sticky top-0 z-10 flex justify-center py-2">
                          <span className="rounded-full border bg-card/90 px-2.5 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase shadow-xs backdrop-blur">
                            {group.label}
                          </span>
                        </div>
                        {group.messages.map((message) => {
                          const outbound = message.direction === "outbound"
                          const optimistic = message.id.startsWith(OPTIMISTIC_PREFIX)
                          return (
                            <article
                              key={message.id}
                              className={cn(
                                "flex",
                                outbound ? "justify-end" : "justify-start",
                                !message.joinsPrevious && "pt-2",
                                optimistic && ENTER_SOFT
                              )}
                            >
                              <div
                                className={cn(
                                  "max-w-[85%] px-3.5 py-2 shadow-xs sm:max-w-[70%]",
                                  outbound
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-card text-card-foreground ring-1 ring-foreground/5",
                                  // Esquinas: el grupo se lee como una sola burbuja,
                                  // con la "cola" sólo en el último mensaje.
                                  "rounded-2xl",
                                  outbound
                                    ? cn(message.joinsPrevious && "rounded-tr-md", message.joinsNext && "rounded-br-md")
                                    : cn(message.joinsPrevious && "rounded-tl-md", message.joinsNext && "rounded-bl-md"),
                                  optimistic && "opacity-80"
                                )}
                              >
                                <MessageContent message={message} outbound={outbound} />
                                {!message.joinsNext && (
                                  <p
                                    className={cn(
                                      "mt-1 flex items-center justify-end gap-1 font-mono text-[10px] tabular-nums",
                                      outbound ? "text-primary-foreground/70" : "text-muted-foreground"
                                    )}
                                  >
                                    {message.sender && <span className="truncate">{message.sender.full_name} ·</span>}
                                    {timeOfDay(message.sent_at)}
                                    {outbound && <DeliveryTick status={message.delivery_status} />}
                                  </p>
                                )}
                              </div>
                            </article>
                          )
                        })}
                      </div>
                    ))
                  )}
                </div>

                {scrolledUp && (
                  <Button
                    size="icon-sm"
                    variant="outline"
                    onClick={jumpToLatest}
                    aria-label="Ir al último mensaje"
                    className={cn(ENTER_SOFT, "absolute right-4 bottom-24 rounded-full bg-card shadow-md")}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                )}

                {window24.state === "expired" ? (
                  <div className="flex items-start gap-2 border-t bg-warning/15 px-5 py-4 text-xs">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <p>
                      Pasaron más de 24 horas desde el último mensaje del cliente. WhatsApp sólo acepta
                      plantillas aprobadas fuera de esa ventana, así que una respuesta libre sería
                      rechazada.
                    </p>
                  </div>
                ) : (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      send()
                    }}
                    className="border-t bg-card px-3 py-3 sm:px-5"
                  >
                    {window24.state === "closing" && (
                      <p className="mb-2 flex items-center gap-1.5 text-xs">
                        <AlertTriangle className="size-3.5" aria-hidden="true" />
                        Quedan {Math.max(1, Math.round(window24.hoursLeft))} h de la ventana de 24 h de WhatsApp.
                      </p>
                    )}
                    <div className="flex items-end gap-2 rounded-xl border bg-background p-1.5 focus-within:ring-3 focus-within:ring-ring/50">
                      <textarea
                        ref={composerRef}
                        value={draft}
                        onChange={(event) => {
                          setDraft(event.target.value)
                          autosize()
                        }}
                        onKeyDown={(event) => {
                          // Enter envía; Shift+Enter baja de línea. `isComposing`
                          // evita enviar a mitad de una tilde o un emoji del IME.
                          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                            event.preventDefault()
                            send()
                          }
                        }}
                        placeholder="Escribí tu respuesta…"
                        rows={1}
                        aria-label="Mensaje"
                        className="max-h-42 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
                      />
                      <Button
                        type="submit"
                        size="icon"
                        disabled={!draft.trim()}
                        aria-label="Enviar"
                        className="shrink-0 rounded-lg transition-transform duration-150 active:scale-95 motion-reduce:active:scale-100"
                      >
                        <Send className="size-4" />
                      </Button>
                    </div>
                    <p className="mt-1.5 hidden text-[10px] text-muted-foreground sm:block">
                      Enter envía · Shift + Enter baja de línea
                    </p>
                  </form>
                )}
              </div>
            </ViewTransition>
          )}
        </section>
      </div>
    </div>
  )
}
