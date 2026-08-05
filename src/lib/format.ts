/** Utilidades de formato en español (es-AR). */

const DATE_FMT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
})

const DATE_SHORT_FMT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
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

export function todayISO(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
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
