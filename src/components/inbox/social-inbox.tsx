"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowRight,
  DownloadCloud,
  AtSign,
  Check,
  CircleSlash,
  MessageCircle,
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import type { ActionResult } from "@/lib/action-result"
import { messagingWindow } from "@/lib/zernio/events"
import { platformLabel } from "@/lib/zernio/types"
import { cn } from "@/lib/utils"

export type SocialConversation = {
  id: string
  platform: string
  participant_name: string | null
  participant_handle: string | null
  status: string
  unread_count: number
  last_message_at: string | null
  last_message_preview: string | null
  last_inbound_at: string | null
  lead_id: string | null
  account: { username: string | null; display_name: string | null; is_active: boolean } | null
}

export type SocialMessage = {
  id: string
  direction: string
  body: string | null
  delivery_status: string
  sent_at: string
  deleted_at: string | null
  sender: { full_name: string } | null
}

const CHANNELS = [
  { value: "todos", label: "Todos" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
] as const

function timeLabel(value: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000)
  if (minutes < 1) return "recién"
  if (minutes < 60) return `hace ${minutes} min`
  if (minutes < 1440) return `hace ${Math.round(minutes / 60)} h`
  return date.toLocaleDateString("es-AR", { day: "numeric", month: "short" })
}

function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  const Icon = platform === "instagram" ? AtSign : MessageCircle
  return <Icon className={cn("size-4", className)} aria-hidden="true" />
}

/**
 * Bandeja de clientes: WhatsApp e Instagram en el mismo panel.
 *
 * El filtro de canal vive en la URL (`?canal=whatsapp`), igual que el resto de
 * los filtros de esta pantalla: así una conversación se puede compartir por
 * link y el botón "atrás" del navegador hace lo que uno espera.
 */
export function SocialInbox({
  conversations,
  messages,
  selectedId,
  channel,
  configured,
  notConfiguredReason,
  isAdmin,
}: {
  conversations: SocialConversation[]
  messages: SocialMessage[]
  selectedId: string | null
  channel: string
  configured: boolean
  notConfiguredReason: string | null
  isAdmin: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState("")

  const selected = useMemo(
    () => conversations.find((item) => item.id === selectedId) ?? null,
    [conversations, selectedId]
  )

  // Marcar atendido al abrir, igual que hace la Bandeja de equipo.
  useEffect(() => {
    if (!selected || selected.unread_count === 0) return
    startTransition(async () => {
      await markSocialConversationRead(selected.id)
      router.refresh()
    })
  }, [selected, router])

  function run(action: Promise<ActionResult<unknown>>, success?: string) {
    startTransition(async () => {
      const result = await action
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? success ?? "Listo.")
      router.refresh()
    })
  }

  function handleSend(event: React.FormEvent) {
    event.preventDefault()
    if (!selected || !draft.trim()) return
    const text = draft
    startTransition(async () => {
      const result = await sendSocialMessage(selected.id, text)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      setDraft("")
      router.refresh()
    })
  }

  if (!configured) {
    return (
      <Card className="flex min-h-[28rem] flex-col items-center justify-center border-dashed p-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <MessageCircle className="size-5" />
        </span>
        <p className="mt-4 font-heading text-lg font-semibold">
          Falta conectar WhatsApp e Instagram
        </p>
        <p className="mt-2 max-w-lg text-sm text-muted-foreground">
          {notConfiguredReason ?? "La integración con Zernio no está configurada."}
        </p>
        <Button variant="outline" size="sm" className="mt-4" render={<Link href="/ajustes/conexiones" />}>
          Ir a Conexiones <ArrowRight className="ml-1 size-4" />
        </Button>
      </Card>
    )
  }

  const window = selected
    ? messagingWindow(selected.platform, selected.last_inbound_at)
    : { state: "not_applicable" as const }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex w-full gap-1 overflow-x-auto rounded-xl border bg-card p-1 sm:w-fit">
        {CHANNELS.map((item) => (
          <Link
            key={item.value}
            href={`/bandeja?tab=clientes&canal=${item.value}`}
            className={cn(
              "inline-flex min-w-max items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              channel === item.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {item.value !== "todos" && <PlatformIcon platform={item.value} />}
            {item.label}
          </Link>
        ))}
      </div>

      {isAdmin && (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => run(backfillSocialInbox())}
        >
          <DownloadCloud className="mr-1 size-4" aria-hidden="true" />
          Importar historial
        </Button>
      )}
      </div>

      <div className="grid min-h-[calc(100dvh-18rem)] overflow-hidden rounded-2xl border bg-card shadow-sm lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="border-b lg:border-b-0 lg:border-r">
          <div className="max-h-[28rem] overflow-y-auto lg:max-h-[calc(100dvh-18rem)]">
            {conversations.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-sm font-medium">Sin conversaciones</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Cuando alguien escriba por {channel === "todos" ? "WhatsApp o Instagram" : platformLabel(channel)}, el chat aparece acá.
                </p>
              </div>
            ) : (
              conversations.map((item) => (
                <Link
                  key={item.id}
                  href={`/bandeja?tab=clientes&canal=${channel}&conversation=${item.id}`}
                  className={cn(
                    "flex gap-3 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/50",
                    item.id === selectedId && "bg-accent/40"
                  )}
                >
                  <PlatformIcon
                    platform={item.platform}
                    className={cn(
                      "mt-1 shrink-0",
                      item.unread_count > 0 ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={cn("truncate text-sm", item.unread_count > 0 ? "font-semibold" : "font-medium")}>
                        {item.participant_name ?? item.participant_handle ?? "Sin nombre"}
                      </p>
                      <span className="label-mono shrink-0 text-muted-foreground">
                        {timeLabel(item.last_message_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {item.last_message_preview ?? "Sin mensajes"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {item.unread_count > 0 && (
                        <Badge className="h-4 px-1.5 text-[10px]">{item.unread_count}</Badge>
                      )}
                      {item.lead_id && (
                        <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                          lead
                        </Badge>
                      )}
                      {item.status === "resolved" && (
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                          resuelta
                        </Badge>
                      )}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </aside>

        {!selected ? (
          <div className="flex min-h-80 flex-col items-center justify-center p-8 text-center">
            <MessageCircle className="size-9 text-muted-foreground" />
            <p className="mt-4 font-heading font-semibold">Elegí una conversación</p>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <PlatformIcon platform={selected.platform} className="text-muted-foreground" />
                  <h2 className="truncate font-heading text-base font-semibold">
                    {selected.participant_name ?? selected.participant_handle ?? "Sin nombre"}
                  </h2>
                </div>
                <p className="label-mono mt-1 text-muted-foreground">
                  {platformLabel(selected.platform)}
                  {selected.participant_handle ? ` · @${selected.participant_handle}` : ""}
                  {selected.account?.username ? ` → ${selected.account.username}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {!selected.lead_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(convertConversationToLead(selected.id))}
                  >
                    <UserPlus className="mr-1 size-4" /> Convertir en lead
                  </Button>
                )}
                {selected.lead_id && (
                  <Button size="sm" variant="ghost" render={<Link href={`/leads/${selected.lead_id}`} />}>
                    Ver lead <ArrowRight className="ml-1 size-4" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    run(
                      setSocialConversationStatus(
                        selected.id,
                        selected.status === "resolved" ? "open" : "resolved"
                      )
                    )
                  }
                >
                  <Check className="mr-1 size-4" />
                  {selected.status === "resolved" ? "Reabrir" : "Resolver"}
                </Button>
              </div>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {messages.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Todavía no hay mensajes en este hilo.
                </p>
              ) : (
                messages.map((message) => {
                  const outbound = message.direction === "outbound"
                  return (
                    <article
                      key={message.id}
                      className={cn("flex", outbound ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-4 py-2.5",
                          outbound ? "bg-primary text-primary-foreground" : "bg-muted"
                        )}
                      >
                        {message.deleted_at ? (
                          <p className="flex items-center gap-1.5 text-sm italic opacity-70">
                            <CircleSlash className="size-3.5" /> Mensaje eliminado
                          </p>
                        ) : (
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {message.body ?? "[adjunto]"}
                          </p>
                        )}
                        <p
                          className={cn(
                            "label-mono mt-1.5",
                            outbound ? "text-primary-foreground/70" : "text-muted-foreground"
                          )}
                        >
                          {timeLabel(message.sent_at)}
                          {outbound && ` · ${message.delivery_status}`}
                          {message.sender && ` · ${message.sender.full_name}`}
                        </p>
                      </div>
                    </article>
                  )
                })
              )}
            </div>

            {window.state === "expired" ? (
              <div className="flex items-start gap-2 border-t bg-warning/10 px-5 py-4 text-xs">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                <p>
                  Pasaron más de 24 horas desde el último mensaje del cliente. WhatsApp sólo
                  acepta plantillas aprobadas fuera de esa ventana, así que una respuesta libre
                  sería rechazada.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSend} className="border-t px-5 py-4">
                {window.state === "closing" && (
                  <p className="mb-2 flex items-center gap-1.5 text-xs text-warning">
                    <AlertTriangle className="size-3.5" aria-hidden="true" />
                    Quedan {Math.max(1, Math.round(window.hoursLeft))} h de la ventana de 24 h de
                    WhatsApp.
                  </p>
                )}
                <div className="flex gap-2">
                  <Textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Escribí tu respuesta…"
                    rows={2}
                    className="min-h-11 flex-1 resize-none"
                    disabled={pending}
                  />
                  <Button type="submit" disabled={pending || !draft.trim()} aria-label="Enviar">
                    <Send className="size-4" />
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
