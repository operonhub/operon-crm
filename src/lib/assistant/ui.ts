/**
 * Lógica de presentación de Operon IA.
 *
 * Todo acá es puro y sin JSX: los componentes quedan como envoltorios finos y
 * las decisiones —qué contexto mandar, cómo saludar, qué estado mostrar, cómo
 * partir el texto en bloques— se pueden probar sin navegador.
 *
 * Este archivo es importable desde el cliente. No traer nada de
 * `service.ts`, `config.ts` ni `provider.ts`: el primero tiene `server-only` y
 * los otros arrastran `node:crypto`.
 */
import { greeting, todayISO, toISODate } from "@/lib/format"
import { CONTEXT_TYPES, type ContextType } from "./request"

// --------------------------------------------------------------- contexto

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Secciones del CRM que el backend sabe revalidar. Lo que no está acá viaja
 * como `general`: es preferible ir sin contexto que mandar uno que el servidor
 * no puede verificar.
 */
const SECTION_CONTEXT: Record<string, ContextType> = {
  proyectos: "project",
  clientes: "client",
  oportunidades: "opportunity",
  finanzas: "finance",
  bandeja: "inbox",
  agentes: "agent",
}

export type PageContext = { type: ContextType; id: string | null }

export function pathToContext(pathname: string): PageContext {
  const segments = pathname.split("/").filter(Boolean)
  if (segments.length === 0) return { type: "dashboard", id: null }

  const type = SECTION_CONTEXT[segments[0]]
  if (!type) return { type: "general", id: null }

  const candidate = segments[1]
  const id = candidate && UUID_RE.test(candidate) ? candidate : null
  return { type, id }
}

/** Etiqueta corta para el chip del composer. */
const CONTEXT_LABELS: Record<ContextType, string> = {
  general: "Sin contexto",
  dashboard: "Hoy",
  client: "Cliente",
  opportunity: "Oportunidad",
  project: "Proyecto",
  finance: "Finanzas",
  inbox: "Bandeja",
  agent: "Agentes",
}

export function contextLabel(context: PageContext): string {
  return CONTEXT_LABELS[context.type] ?? CONTEXT_LABELS.general
}

// ---------------------------------------------------------------- saludo

/**
 * Preguntas de apertura. No llevan el nombre adentro: el nombre va en el
 * saludo, así una sola lista sirve tenga o no tenga nombre configurado.
 */
const OPENERS = [
  "¿Qué hacemos hoy?",
  "¿Por dónde arrancamos?",
  "Te escucho.",
  "Decime.",
  "¿En qué te doy una mano?",
] as const

export function greetingFor(input: {
  /** Cómo pidió que le digan. Es lo que hace que esto se sienta propio. */
  preferredName: string
  fullName: string
  /** Rota la frase. Se calcula en el cliente para no arriesgar hidratación. */
  seed: number
  now?: Date
}): string {
  const name =
    input.preferredName.trim() || input.fullName.trim().split(/\s+/)[0] || ""

  const hora = greeting(input.now ?? new Date())
  const opener = OPENERS[Math.abs(Math.trunc(input.seed)) % OPENERS.length]

  return name ? `${hora}, ${name}. ${opener}` : `${hora}. ${opener}`
}

// ---------------------------------------------------------------- estado

/**
 * Conjunto cerrado de etiquetas de estado.
 *
 * Es deliberado que no exista forma de devolver texto libre acá: así ninguna
 * edición futura puede reintroducir afirmaciones como "CRM conectado" o un
 * conteo de herramientas que nadie verifica.
 */
export const CONNECTION_LABELS = [
  "Sin conectar",
  "Listo",
  "Respondiendo…",
  "Sin respuesta",
] as const

export type ConnectionLabel = (typeof CONNECTION_LABELS)[number]
export type AssistantStatus = "idle" | "streaming" | "error"
export type ConnectionTone = "muted" | "success" | "warning" | "destructive"

export function connectionLabel(state: {
  configured: boolean
  status: AssistantStatus
}): { text: ConnectionLabel; tone: ConnectionTone } {
  if (!state.configured) return { text: "Sin conectar", tone: "warning" }
  if (state.status === "streaming") return { text: "Respondiendo…", tone: "muted" }
  if (state.status === "error") return { text: "Sin respuesta", tone: "destructive" }
  return { text: "Listo", tone: "success" }
}

/**
 * El límite del asistente, al lado del estado.
 *
 * Decía "Web · sin acceso al CRM" hasta que se verificó contra el Hermes real
 * del VPS: el toolset de búsqueda web está apagado por falta de credencial
 * (`check_web_api_key` da False en el log del gateway, y preguntado
 * directamente contesta que no la tiene). Anunciar "Web" era afirmar una
 * capacidad inexistente.
 *
 * Se eligió recortar en vez de corregir el texto por una razón de fondo: el
 * `api_server` de Hermes no expone qué toolsets tiene activos —ni
 * `/v1/capabilities` ni `/health/detailed` los informan— así que el CRM no
 * puede verificar una afirmación de capacidad. Lo único que sí sabemos con
 * certeza es el límite, porque no existen herramientas del CRM en Hermes.
 *
 * Volver a nombrar una capacidad exige poder comprobarla, no acordarse de
 * actualizar esta línea.
 */
export const CAPABILITY_NOTE = "Sin acceso a los datos del CRM"

// --------------------------------------------------------- conversaciones

export type ConversationSummary = {
  id: string
  title: string
  updated_at: string
}

export type ConversationGroup = {
  label: "Hoy" | "Ayer" | "Anteriores"
  items: ConversationSummary[]
}

function previousDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

/**
 * Día argentino de un timestamp.
 *
 * No sirve cortar el string en la "T": eso da la fecha UTC, y como Argentina
 * va tres horas atrás, todo lo posterior a las 21:00 aparecería con la fecha
 * del día siguiente. Se reformatea con `todayISO`, que ya usa `TIMEZONE`, para
 * que el huso quede definido en un solo lugar del repo.
 */
function argentineDay(value: string | null | undefined): string | null {
  if (!value) return null
  // Una columna `date` ya viene sin hora: interpretarla como medianoche UTC
  // la correría un día hacia atrás.
  if (!value.includes("T")) return toISODate(value)

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : todayISO(date)
}

/** Agrupa por día usando la fecha argentina, no la del navegador. */
export function conversationGroups(
  conversations: ConversationSummary[],
  today: string
): ConversationGroup[] {
  const yesterday = previousDay(today)
  const buckets: Record<ConversationGroup["label"], ConversationSummary[]> = {
    Hoy: [],
    Ayer: [],
    Anteriores: [],
  }

  for (const conversation of conversations) {
    const day = argentineDay(conversation.updated_at)
    // Una fecha futura (reloj desincronizado) cuenta como hoy: preferimos
    // mostrarla arriba antes que perderla en "Anteriores".
    if (!day || day >= today) buckets.Hoy.push(conversation)
    else if (day === yesterday) buckets.Ayer.push(conversation)
    else buckets.Anteriores.push(conversation)
  }

  return (Object.keys(buckets) as ConversationGroup["label"][])
    .filter((label) => buckets[label].length > 0)
    .map((label) => ({ label, items: buckets[label] }))
}

// ---------------------------------------------------------------- bloques

export type Inline =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "code"; value: string }
  | { type: "link"; href: string; label: string }

export type Block =
  | { type: "paragraph"; parts: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "code"; language: string | null; content: string }

const INLINE_RE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(https?:\/\/[^\s<]+)/g
/** Puntuación que cierra una oración y no forma parte del enlace. */
const TRAILING = /[.,;:!?)\]}]+$/

/**
 * Parte una línea en fragmentos con formato.
 *
 * Devuelve datos, nunca marcado: el componente construye nodos de React y el
 * texto se escapa solo. No hay ningún camino que produzca HTML crudo.
 */
export function parseInline(text: string): Inline[] {
  const parts: Inline[] = []
  let last = 0

  for (const match of text.matchAll(INLINE_RE)) {
    const index = match.index ?? 0
    if (index > last) {
      parts.push({ type: "text", value: text.slice(last, index) })
    }

    const [raw, code, bold, url] = match
    if (code) {
      parts.push({ type: "code", value: code.slice(1, -1) })
    } else if (bold) {
      parts.push({ type: "bold", value: bold.slice(2, -2) })
    } else if (url) {
      // El punto final pertenece a la oración, no al enlace.
      const trailing = url.match(TRAILING)?.[0] ?? ""
      const href = trailing ? url.slice(0, -trailing.length) : url
      parts.push({ type: "link", href, label: href })
      if (trailing) parts.push({ type: "text", value: trailing })
    }

    last = index + raw.length
  }

  if (last < text.length) {
    parts.push({ type: "text", value: text.slice(last) })
  }
  return parts
}

const BULLET_RE = /^\s*[-*]\s+(.*)$/
const ORDERED_RE = /^\s*\d+[.)]\s+(.*)$/

/**
 * Convierte la respuesta en bloques renderizables.
 *
 * Cubre lo que el modelo produce de verdad: párrafos, listas, negritas, código
 * y enlaces citados (las reglas de la política le exigen citar fuentes, así que
 * los enlaces aparecen seguido). Nada de tablas todavía: no hay datos del CRM
 * que ponerles adentro.
 */
export function parseBlocks(text: string): Block[] {
  const lines = text.split(/\r?\n/)
  const blocks: Block[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    blocks.push({ type: "paragraph", parts: parseInline(paragraph.join(" ")) })
    paragraph = []
  }
  const flushList = () => {
    if (!list) return
    blocks.push({
      type: "list",
      ordered: list.ordered,
      items: list.items.map(parseInline),
    })
    list = null
  }
  const flushAll = () => {
    flushParagraph()
    flushList()
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.trimStart().startsWith("```")) {
      flushAll()
      const language = line.trim().slice(3).trim() || null
      const body: string[] = []
      i++
      // Un bloque sin cerrar toma lo que queda: preferible a tragarse el
      // resto de la respuesta en silencio.
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        body.push(lines[i])
        i++
      }
      blocks.push({ type: "code", language, content: body.join("\n") })
      continue
    }

    if (!line.trim()) {
      flushAll()
      continue
    }

    const bullet = line.match(BULLET_RE)
    const ordered = line.match(ORDERED_RE)
    if (bullet || ordered) {
      flushParagraph()
      const isOrdered = Boolean(ordered)
      const content = (bullet ?? ordered)![1]
      if (list && list.ordered !== isOrdered) flushList()
      list ??= { ordered: isOrdered, items: [] }
      list.items.push(content)
      continue
    }

    flushList()
    paragraph.push(line.trim())
  }

  flushAll()
  return blocks
}

/** Nombre legible de una herramienta de Hermes. */
export function toolLabel(name: string): string {
  if (name.includes("search")) return "Buscando en la web"
  if (name.includes("browse") || name.includes("fetch")) return "Leyendo una página"
  return "Trabajando"
}

/** Re-exportado para que los componentes no importen `request.ts` sólo por esto. */
export { CONTEXT_TYPES }

// ----------------------------------------------------------- preferencias

/**
 * Descripción del formulario de preferencias, como datos.
 *
 * Escrito así y no a mano en el JSX para que un test pueda afirmar que todo
 * valor de los catálogos de `policy.ts` tiene su etiqueta. Si mañana se agrega
 * un tono allá y se olvida acá, la opción no aparecería en pantalla y el
 * código compilaría igual; con esta forma, el olvido es un test en rojo.
 *
 * Sólo hay preferencias de estilo. Qué puede hacer Operon IA no se elige acá:
 * eso lo fija la política del servidor.
 */
export type PreferenceField = {
  key:
    | "tone"
    | "technicalLevel"
    | "verbosity"
    | "humorLevel"
    | "geekReferenceFrequency"
    | "proactivityLevel"
    | "responseFormat"
  legend: string
  help: string
  options: { value: string; label: string }[]
}

export const PREFERENCE_FIELDS: PreferenceField[] = [
  {
    key: "tone",
    legend: "Tono",
    help: "Cómo te habla.",
    options: [
      { value: "directo", label: "Directo" },
      { value: "neutral", label: "Neutral" },
      { value: "cercano", label: "Cercano" },
    ],
  },
  {
    key: "technicalLevel",
    legend: "Nivel técnico",
    help: "Cuánta jerga da por sabida.",
    options: [
      { value: "basico", label: "Básico" },
      { value: "intermedio", label: "Intermedio" },
      { value: "avanzado", label: "Avanzado" },
    ],
  },
  {
    key: "verbosity",
    legend: "Extensión",
    help: "Qué tan largas son las respuestas.",
    options: [
      { value: "breve", label: "Breve" },
      { value: "equilibrada", label: "Equilibrada" },
      { value: "detallada", label: "Detallada" },
    ],
  },
  {
    key: "responseFormat",
    legend: "Formato",
    help: "Por dónde empieza cada respuesta.",
    options: [
      { value: "conclusion_primero", label: "Conclusión primero" },
      { value: "narrativo", label: "Narrativo" },
      { value: "puntos", label: "En puntos" },
    ],
  },
  {
    key: "proactivityLevel",
    legend: "Proactividad",
    help: "Cuánto sugiere sin que le pidas.",
    options: [
      { value: "baja", label: "Baja" },
      { value: "media", label: "Media" },
      { value: "alta", label: "Alta" },
    ],
  },
  {
    key: "humorLevel",
    legend: "Humor",
    help: "Cuánto se permite.",
    options: [
      { value: "ninguno", label: "Nada" },
      { value: "leve", label: "Leve" },
      { value: "frecuente", label: "Seguido" },
    ],
  },
  {
    key: "geekReferenceFrequency",
    legend: "Referencias geek",
    help: "Guiños a cine, series y tecnología.",
    options: [
      { value: "nunca", label: "Nunca" },
      { value: "ocasional", label: "A veces" },
      { value: "frecuente", label: "Seguido" },
    ],
  },
]
