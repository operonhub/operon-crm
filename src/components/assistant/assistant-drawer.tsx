"use client"

/**
 * Cajón de conversaciones recientes.
 *
 * Va adentro del panel como capa absoluta y no como `Sheet` aparte: anidar un
 * diálogo dentro de otro pelea por el foco y por el bloqueo de scroll. Acá el
 * `Dialog` del panel sigue siendo el único dueño de esas dos cosas.
 *
 * Con 480px de ancho no hay lugar para una columna fija al lado del hilo, así
 * que el cajón lo tapa y se corre al elegir.
 */

import { useEffect, useRef, useState } from "react"
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { todayISO } from "@/lib/format"
import { conversationGroups, type ConversationSummary } from "@/lib/assistant/ui"
import { useAssistant } from "./assistant-provider"

export function AssistantDrawer() {
  const {
    drawerOpen,
    setDrawerOpen,
    conversations,
    conversationId,
    loadingConversationId,
    openConversation,
    archive,
    rename,
  } = useAssistant()

  if (!drawerOpen) return null

  // Se calcula en el render del cliente: `todayISO` mira el huso argentino,
  // no el del servidor, que en Vercel es UTC.
  const groups = conversationGroups(conversations, todayISO())

  return (
    <>
      {/*
        Tapa el resto del panel para poder cerrar tocando afuera. No lleva rol
        de botón: es una superficie de descarte, y el botón X de al lado ya da
        la salida accesible por teclado.
      */}
      <div
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
        className="absolute inset-0 z-10 bg-black/40"
      />

      <aside
        aria-label="Conversaciones recientes"
        className={cn(
          "absolute inset-y-0 left-0 z-20 flex w-60 flex-col",
          "border-r border-white/10 bg-[#191712]",
          // `starting:` compila a @starting-style, que es lo que anima un
          // elemento común al aparecer. `data-starting-style` no sirve acá:
          // ese atributo lo pone base-ui y este no es un componente suyo.
          "transition-transform duration-200 ease-out",
          "starting:-translate-x-full motion-reduce:transition-none"
        )}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2.5">
          <h3 className="label-mono flex-1 text-[#FBF9F4]/60">Recientes</h3>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Cerrar conversaciones"
            className="flex size-7 items-center justify-center rounded-md text-[#FBF9F4]/60 transition-colors hover:bg-white/[0.08] hover:text-[#FBF9F4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning motion-reduce:transition-none"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
          {groups.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm leading-relaxed text-[#FBF9F4]/45">
              Todavía no hay conversaciones guardadas.
            </p>
          ) : (
            groups.map((group) => (
              <section key={group.label} className="mb-3 last:mb-0">
                <h4 className="label-mono px-2 py-1 text-[#FBF9F4]/40">
                  {group.label}
                </h4>
                <ul>
                  {group.items.map((conversation) => (
                    <ConversationRow
                      key={conversation.id}
                      conversation={conversation}
                      active={conversation.id === conversationId}
                      loading={conversation.id === loadingConversationId}
                      onOpen={() => openConversation(conversation.id)}
                      onArchive={() => archive(conversation.id)}
                      onRename={(title) => rename(conversation.id, title)}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </aside>
    </>
  )
}

function ConversationRow({
  conversation,
  active,
  loading,
  onOpen,
  onArchive,
  onRename,
}: {
  conversation: ConversationSummary
  active: boolean
  loading: boolean
  onOpen: () => void
  onArchive: () => void
  onRename: (title: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(conversation.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  function commit() {
    const title = draft.trim()
    if (title && title !== conversation.title) onRename(title)
    setEditing(false)
  }

  if (editing) {
    return (
      <li className="px-1 py-0.5">
        <div className="flex items-center gap-1 rounded-lg border border-white/20 bg-white/[0.06] px-2 py-1">
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                commit()
              }
              // Sin esto, Escape cerraría el panel entero en vez de cancelar
              // el cambio de nombre.
              if (event.key === "Escape") {
                event.preventDefault()
                event.stopPropagation()
                setDraft(conversation.title)
                setEditing(false)
              }
            }}
            aria-label="Nombre de la conversación"
            className="min-w-0 flex-1 bg-transparent text-sm text-[#FBF9F4] focus:outline-none"
          />
          <button
            type="button"
            onClick={commit}
            aria-label="Guardar nombre"
            className="flex size-6 shrink-0 items-center justify-center rounded text-[#FBF9F4]/70 hover:text-[#FBF9F4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning"
          >
            <Check className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </li>
    )
  }

  return (
    <li className="group/row relative px-1 py-0.5">
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg py-1.5 pr-14 pl-2 text-left transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning",
          "motion-reduce:transition-none",
          active
            ? "bg-white/[0.1] text-[#FBF9F4]"
            : "text-[#FBF9F4]/70 hover:bg-white/[0.06] hover:text-[#FBF9F4]"
        )}
      >
        {loading && (
          <Loader2
            className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        )}
        <span className="truncate text-sm">{conversation.title}</span>
      </button>

      {/*
        Siempre presentes, apenas atenuados, en vez de aparecer al pasar el
        mouse. En una pantalla táctil no existe `hover`: revelarlos así los
        dejaría inalcanzables desde el celular. Se ganan un poco de ruido
        visual a cambio de funcionar en todos lados.
      */}
      <div className="absolute top-1/2 right-2 flex -translate-y-1/2 gap-0.5">
        <button
          type="button"
          onClick={() => {
            setDraft(conversation.title)
            setEditing(true)
          }}
          aria-label={`Renombrar «${conversation.title}»`}
          className="flex size-6 items-center justify-center rounded text-[#FBF9F4]/35 transition-colors group-hover/row:text-[#FBF9F4]/70 hover:bg-white/10 hover:!text-[#FBF9F4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning motion-reduce:transition-none"
        >
          <Pencil className="size-3" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onArchive}
          aria-label={`Archivar «${conversation.title}»`}
          title="Archivar. No se borra: se puede recuperar."
          className="flex size-6 items-center justify-center rounded text-[#FBF9F4]/35 transition-colors group-hover/row:text-[#FBF9F4]/70 hover:bg-white/10 hover:!text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning motion-reduce:transition-none"
        >
          <Trash2 className="size-3" aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}
