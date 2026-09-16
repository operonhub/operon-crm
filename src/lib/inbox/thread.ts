/**
 * Lógica de presentación del hilo de mensajes de la Bandeja.
 *
 * Módulo puro: sin React ni navegador, se prueba con Vitest. El componente sólo
 * pinta lo que esto decide.
 */

export type ThreadMessage = {
  id: string
  direction: string
  body: string | null
  attachments?: unknown
  delivery_status: string
  sent_at: string
  deleted_at: string | null
  sender: { full_name: string } | null
}

export type PositionedMessage<M extends ThreadMessage = ThreadMessage> = M & {
  /** Mismo lado que el anterior y cerca en el tiempo: se pega arriba. */
  joinsPrevious: boolean
  /** Mismo lado que el siguiente y cerca en el tiempo: la hora va en el último. */
  joinsNext: boolean
}

export type DayGroup<M extends ThreadMessage = ThreadMessage> = {
  key: string
  label: string
  messages: PositionedMessage<M>[]
}

/**
 * Cuánto pueden separarse dos mensajes del mismo lado para leerse como uno
 * solo. Cinco minutos es lo que tarda alguien en mandar tres mensajes cortos
 * seguidos; más que eso ya es otra idea.
 */
const JOIN_WINDOW_MS = 5 * 60_000

const TZ = "America/Argentina/Buenos_Aires"

/** Fecha calendario en Argentina, no en UTC: un mensaje de las 22 h es de hoy. */
function localDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(date)
}

export function dayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  const day = localDay(date)
  if (day === localDay(now)) return "Hoy"

  const yesterday = new Date(now.getTime() - 86_400_000)
  if (day === localDay(yesterday)) return "Ayer"

  const sameYear = day.slice(0, 4) === localDay(now).slice(0, 4)
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date)
}

export function timeOfDay(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso))
}

/**
 * Agrupa por día y marca qué mensajes van pegados.
 *
 * Asume el orden cronológico que ya trae la consulta (`order("sent_at")`), pero
 * no depende de él para agrupar por día: un mensaje fuera de orden igual cae en
 * su día.
 */
export function groupThread<M extends ThreadMessage>(
  messages: M[],
  now: Date = new Date()
): DayGroup<M>[] {
  const groups: DayGroup<M>[] = []

  messages.forEach((message, index) => {
    const day = localDay(new Date(message.sent_at))
    let group = groups.at(-1)
    if (!group || group.key !== day) {
      group = { key: day, label: dayLabel(message.sent_at, now), messages: [] }
      groups.push(group)
    }

    const previous = messages[index - 1]
    const next = messages[index + 1]
    const joins = (a: M | undefined, b: M | undefined) =>
      Boolean(
        a &&
          b &&
          a.direction === b.direction &&
          localDay(new Date(a.sent_at)) === localDay(new Date(b.sent_at)) &&
          Math.abs(new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()) <= JOIN_WINDOW_MS
      )

    group.messages.push({
      ...message,
      joinsPrevious: joins(previous, message),
      joinsNext: joins(message, next),
    })
  })

  return groups
}

export type Attachment = { kind: "image" | "video" | "audio" | "file"; url: string | null; name: string | null }

/** Adjuntos en una forma segura de pintar. La forma cruda la define cada plataforma. */
export function readAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    if (typeof item !== "object" || item === null) return []
    const a = item as Record<string, unknown>
    const type = String(a.type ?? a.mimeType ?? "").toLowerCase()
    const url = typeof a.url === "string" && /^https:\/\//.test(a.url) ? a.url : null
    const kind: Attachment["kind"] = type.includes("image")
      ? "image"
      : type.includes("video")
        ? "video"
        : type.includes("audio")
          ? "audio"
          : "file"
    const name = typeof a.name === "string" ? a.name : typeof a.filename === "string" ? a.filename : null
    return [{ kind, url, name }]
  })
}

/**
 * Textos que Zernio pone cuando la plataforma no expone el contenido
 * (stickers, encuestas, algunos tipos de WhatsApp). Mostrarlos tal cual —
 * "[Unsupported message]"— parece un error del CRM; mejor explicarlo.
 */
export function placeholderKind(body: string | null): "unsupported" | "attachment" | null {
  if (!body) return null
  const text = body.trim().toLowerCase()
  if (text === "[unsupported message]") return "unsupported"
  if (text === "[attachment]" || text === "[adjunto]") return "attachment"
  return null
}

/** Iniciales para el avatar cuando no hay foto: "Jonás Zandanel" → "JZ", "5491122…" → "#". */
export function initials(name: string | null): string {
  if (!name) return "?"
  const words = name.trim().split(/\s+/).filter((w) => /\p{L}/u.test(w))
  if (words.length === 0) return "#"
  return (words[0][0] + (words.length > 1 ? words.at(-1)![0] : "")).toUpperCase()
}
