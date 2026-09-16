/**
 * Tipos de dominio de Zernio y normalización de sus respuestas.
 *
 * Módulo **puro**: no hace red, no lee entorno. Se prueba con Vitest sin
 * levantar nada, igual que `src/lib/pipeline/funnel.ts`.
 *
 * Por qué existe la normalización: la API devuelve `_id`, `profileId` como
 * objeto anidado y nombres en inglés; el CRM habla en snake_case y con los
 * nombres de columna de `social_accounts`. Traducir en un solo lugar evita que
 * la forma de Zernio se filtre a los componentes.
 */

/** Las plataformas que el CRM modela hoy (check de `social_accounts.platform`). */
export const SUPPORTED_PLATFORMS = [
  "whatsapp",
  "instagram",
  "facebook",
  "telegram",
] as const

export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number]
export type AccountPlatform = SupportedPlatform | "other"

/** Cuenta conectada, ya en la forma que guarda `social_accounts`. */
export type ZernioAccount = {
  zernioAccountId: string
  zernioProfileId: string | null
  platform: AccountPlatform
  username: string | null
  displayName: string | null
  profileUrl: string | null
  avatarUrl: string | null
  isActive: boolean
  followerCount: number | null
}

export const PLATFORM_LABELS: Record<AccountPlatform, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  telegram: "Telegram",
  other: "Otra plataforma",
}

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[normalizePlatform(platform)]
}

/**
 * Zernio soporta 16 plataformas y suma más. Las que el CRM no modela caen en
 * `other` en vez de romper el check de la base: preferimos guardar la cuenta y
 * mostrarla apagada antes que perder la sincronización entera por una
 * plataforma nueva.
 */
export function normalizePlatform(value: unknown): AccountPlatform {
  if (typeof value !== "string") return "other"
  const platform = value.trim().toLowerCase()
  return (SUPPORTED_PLATFORMS as readonly string[]).includes(platform)
    ? (platform as SupportedPlatform)
    : "other"
}

// ------------------------------------------------------------
// Normalización de respuestas
// ------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  const rounded = Math.trunc(value)
  return rounded >= 0 ? rounded : null
}

/**
 * `profileId` puede venir como string suelto o como objeto `{ _id, name, slug }`
 * según el endpoint. Se aceptan las dos formas.
 */
function readProfileId(raw: Record<string, unknown>): string | null {
  const direct = asTrimmedString(raw.profileId)
  if (direct) return direct

  const nested = asRecord(raw.profileId)
  if (nested) return asTrimmedString(nested._id) ?? asTrimmedString(nested.id)

  return null
}

/**
 * Convierte una cuenta cruda de Zernio a la forma del CRM.
 * Devuelve `null` si no trae identificador: sin él no se puede deduplicar ni
 * enlazar nada, así que es preferible saltearla a guardar una fila inútil.
 */
export function normalizeAccount(input: unknown): ZernioAccount | null {
  const raw = asRecord(input)
  if (!raw) return null

  const zernioAccountId = asTrimmedString(raw._id) ?? asTrimmedString(raw.id)
  if (!zernioAccountId) return null

  return {
    zernioAccountId,
    zernioProfileId: readProfileId(raw),
    platform: normalizePlatform(raw.platform),
    username: asTrimmedString(raw.username),
    displayName: asTrimmedString(raw.displayName) ?? asTrimmedString(raw.name),
    profileUrl: asTrimmedString(raw.profileUrl),
    avatarUrl:
      asTrimmedString(raw.profilePicture) ?? asTrimmedString(raw.picture),
    // Sólo un `false` explícito marca la cuenta como caída. Si el campo no
    // viene, asumimos que está viva: apagar una cuenta buena por un cambio de
    // contrato sería peor que mostrarla y que falle al usarla.
    isActive: raw.isActive !== false,
    followerCount: asNonNegativeInt(raw.followerCount),
  }
}

/**
 * Extrae la lista de cuentas del sobre de la respuesta.
 *
 * El sobre real, verificado contra la API el 2026-09-15, es
 * `{ accounts: [...], hasAnalyticsAccess: boolean }` — **no** `{ data: [...] }`,
 * que es lo que sugería la documentación.
 *
 * Se siguen aceptando las otras formas razonables (`[…]`, `{ data: […] }`,
 * `{ data: { accounts: […] } }`) porque la doc y la API no coinciden y no vale
 * la pena apostar a cuál de las dos se corrige. Cuando no aparece ninguna, se
 * devuelve `null` —no una lista vacía—: esa distinción es la que permite a la
 * UI decir "la respuesta no tiene el formato esperado" en lugar de "no hay
 * cuentas conectadas", que serían dos bugs muy distintos.
 */
export function parseAccountsPayload(payload: unknown): ZernioAccount[] | null {
  const candidates: unknown[] = []

  if (Array.isArray(payload)) {
    candidates.push(payload)
  } else {
    const root = asRecord(payload)
    if (root) {
      candidates.push(root.data, root.accounts)
      const data = asRecord(root.data)
      if (data) candidates.push(data.accounts, data.items)
    }
  }

  const list = candidates.find(Array.isArray)
  if (!list) return null

  return (list as unknown[])
    .map(normalizeAccount)
    .filter((account): account is ZernioAccount => account !== null)
}

/**
 * `hasAnalyticsAccess` viaja en la misma respuesta que las cuentas y dice si el
 * add-on de analíticas está contratado.
 *
 * Importa porque decide qué puede mostrar Redes sociales: sin add-on hay likes
 * y comentarios, pero no alcance, ni impresiones, ni histórico de seguidores.
 * Devuelve `null` cuando la respuesta no lo trae —"no sé" no es "no tiene"—.
 */
export function parseAnalyticsAccess(payload: unknown): boolean | null {
  const root = asRecord(payload)
  if (!root) return null

  if (typeof root.hasAnalyticsAccess === "boolean") return root.hasAnalyticsAccess

  const data = asRecord(root.data)
  if (data && typeof data.hasAnalyticsAccess === "boolean") {
    return data.hasAnalyticsAccess
  }

  return null
}
