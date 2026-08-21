"use client"

import { useState } from "react"
import { AlertTriangle, Check, Copy, RotateCcw, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { parseBlocks, toolLabel, type Block, type Inline } from "@/lib/assistant/ui"
import type { Turn } from "./assistant-provider"

/**
 * Un turno de la conversación.
 *
 * El texto se renderiza como bloques —párrafos, listas, código, enlaces— para
 * que una respuesta larga se pueda escanear. Los bloques salen de datos, nunca
 * de HTML: cada parte se convierte en un nodo de React y el texto lo escapa
 * React solo.
 */

function InlineParts({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((part, index) => {
        if (part.type === "bold") {
          return (
            <strong key={index} className="font-semibold text-[#FBF9F4]">
              {part.value}
            </strong>
          )
        }
        if (part.type === "code") {
          return (
            <code
              key={index}
              className="rounded bg-white/10 px-1 py-0.5 font-mono text-[0.85em]"
            >
              {part.value}
            </code>
          )
        }
        if (part.type === "link") {
          return (
            <a
              key={index}
              href={part.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-warning underline decoration-warning/40 underline-offset-2 hover:decoration-warning"
            >
              {part.label}
            </a>
          )
        }
        return <span key={index}>{part.value}</span>
      })}
    </>
  )
}

function CodeBlock({ block }: { block: Extract<Block, { type: "code" }> }) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black/30">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="label-mono text-[#FBF9F4]/60">
          {block.language ?? "código"}
        </span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(block.content)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          className="rounded p-1 text-[#FBF9F4]/60 transition-colors hover:text-[#FBF9F4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning motion-reduce:transition-none"
          aria-label="Copiar código"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed">
        <code>{block.content}</code>
      </pre>
    </div>
  )
}

function Blocks({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-[#FBF9F4]/85">
      {parseBlocks(text).map((block, index) => {
        if (block.type === "code") return <CodeBlock key={index} block={block} />
        if (block.type === "list") {
          const List = block.ordered ? "ol" : "ul"
          return (
            <List
              key={index}
              className={cn(
                "space-y-1 pl-5",
                block.ordered ? "list-decimal" : "list-disc"
              )}
            >
              {block.items.map((item, i) => (
                <li key={i} className="marker:text-[#FBF9F4]/40">
                  <InlineParts parts={item} />
                </li>
              ))}
            </List>
          )
        }
        return (
          <p key={index}>
            <InlineParts parts={block.parts} />
          </p>
        )
      })}
    </div>
  )
}

/** Actividad real de herramientas. Sale de eventos del stream, no de adivinar. */
function ToolStrip({ tools }: { tools: Turn["tools"] }) {
  if (tools.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {tools.map((tool) => (
        <span
          key={tool.name}
          className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.06] px-2 py-1 label-mono text-[#FBF9F4]/60"
        >
          <Search className="size-3" aria-hidden="true" />
          {toolLabel(tool.name)}
          {tool.status === "running" && "…"}
        </span>
      ))}
    </div>
  )
}

export function AssistantMessage({
  turn,
  streamingText,
  isStreaming,
  onRetry,
}: {
  turn: Turn
  streamingText?: string
  isStreaming?: boolean
  onRetry?: () => void
}) {
  const [copied, setCopied] = useState(false)

  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl bg-white/[0.07] px-4 py-2.5 text-sm leading-relaxed text-[#FBF9F4]">
          {turn.content}
        </div>
      </div>
    )
  }

  const text = isStreaming ? (streamingText ?? "") : turn.content
  const showActions = !isStreaming && text.length > 0

  return (
    <div className="space-y-2" aria-busy={isStreaming || undefined}>
      <ToolStrip tools={turn.tools} />

      {text && <Blocks text={text} />}

      {isStreaming && (
        <span
          aria-hidden="true"
          className="inline-block h-4 w-1.5 animate-pulse rounded-sm bg-warning align-middle motion-reduce:animate-none"
        />
      )}

      {turn.error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-[#FBF9F4]"
        >
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-destructive"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p>{turn.error}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-1.5 inline-flex items-center gap-1 text-xs text-warning hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning"
              >
                <RotateCcw className="size-3" aria-hidden="true" />
                Reintentar
              </button>
            )}
          </div>
        </div>
      )}

      {turn.stopped && (
        <p className="label-mono text-[#FBF9F4]/60">
          Detenido · esta respuesta parcial puede no haber quedado guardada
        </p>
      )}

      {showActions && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(text)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 label-mono text-[#FBF9F4]/50 transition-colors hover:bg-white/[0.06] hover:text-[#FBF9F4]/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning motion-reduce:transition-none"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
      )}
    </div>
  )
}
