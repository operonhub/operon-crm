/** Utilidades de formato en español (es-AR). */

/**
 * Toda la operación de Operon es en Argentina: "hoy" se calcula siempre en esta
 * zona, no en la del servidor (en Vercel las funciones corren en UTC, así que
 * entre las 21:00 y medianoche el día ya habría cambiado).
 */
export const TIMEZONE = "America/Argentina/Buenos_Aires"

const DATE_FMT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
})

const DATE_SHORT_FMT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
})

const DATE_NUMERIC_FMT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

/** en-CA con timeZone da directamente 'YYYY-MM-DD'. */
const ISO_TZ_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

const LONG_DATE_FMT = new Intl.DateTimeFormat("es-AR", {
  timeZone: TIMEZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
})

const HOUR_TZ_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  hour: "2-digit",
  hour12: false,
})

/** Parsea una fecha 'YYYY-MM-DD' como fecha local (evita corrimiento por UTC). */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const [y, m, d] = value.split("T")[0].split("-").map(Number)
  if (!y || !m || !d) return new Date(value)
  return new Date(y, m - 1, d)
}

export function formatDate(value: string | null | undefined): string {
  const date = parseDate(value)
  return date ? DATE_FMT.format(date) : "—"
}

export function formatDateShort(value: string | null | undefined): string {
  const date = parseDate(value)
  return date ? DATE_SHORT_FMT.format(date) : "—"
}

/** Fecha operativa compacta y sin ambigüedad: 20/08/2026. */
export function formatDateNumeric(value: string | null | undefined): string {
  const date = parseDate(value)
  return date ? DATE_NUMERIC_FMT.format(date) : "—"
}

/** Fecha de hoy (YYYY-MM-DD) en horario de Argentina. */
export function todayISO(now: Date = new Date()): string {
  return ISO_TZ_FMT.format(now)
}

/** Normaliza un valor de fecha/timestamp a 'YYYY-MM-DD'. */
export function toISODate(value: string | null | undefined): string | null {
  if (!value) return null
  return value.split("T")[0]
}

/** Suma días a una fecha ISO (YYYY-MM-DD). Opera en UTC para no cruzar husos. */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Días calendario entre dos fechas ISO (to - from). Negativo si `to` ya pasó. */
export function daysBetweenISO(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number)
  const [ty, tm, td] = to.split("-").map(Number)
  const a = Date.UTC(fy, fm - 1, fd)
  const b = Date.UTC(ty, tm - 1, td)
  return Math.round((b - a) / 86_400_000)
}

/** "domingo 16 de agosto" — para el encabezado del panel. */
export function formatLongDate(now: Date = new Date()): string {
  // es-AR devuelve "domingo, 16 de agosto"; sacamos la coma.
  return LONG_DATE_FMT.format(now).replace(",", "")
}

/** Saludo según la hora de Argentina. */
export function greeting(now: Date = new Date()): string {
  const hour = Number(HOUR_TZ_FMT.format(now))
  if (hour < 13) return "Buen día"
  if (hour < 20) return "Buenas tardes"
  return "Buenas noches"
}

/** Etiqueta relativa corta: "vencía ayer", "hoy", "mañana", "en 3 días". */
export function relativeDayLabel(
  value: string | null | undefined,
  today: string = todayISO()
): string | null {
  const iso = toISODate(value)
  if (!iso) return null
  const diff = daysBetweenISO(today, iso)
  if (diff === 0) return "hoy"
  if (diff === 1) return "mañana"
  if (diff === -1) return "ayer"
  if (diff < 0) return `hace ${Math.abs(diff)} días`
  return `en ${diff} días`
}

/** true si la fecha (YYYY-MM-DD) es anterior a hoy. */
export function isOverdue(value: string | null | undefined): boolean {
  if (!value) return false
  return value.split("T")[0] < todayISO()
}

/** true si la fecha (YYYY-MM-DD) es hoy. */
export function isToday(value: string | null | undefined): boolean {
  if (!value) return false
  return value.split("T")[0] === todayISO()
}

export function formatMoney(
  amount: number | null | undefined,
  currency = "USD"
): string {
  if (amount == null) return "—"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}
