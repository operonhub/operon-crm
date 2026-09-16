import { normalizePlatform, type AccountPlatform } from "./types"

/**
 * Normalización del contenido y sus métricas.
 *
 * Módulo puro. Las formas salen de llamar a la API real con la cuenta de Operon
 * el 2026-09-15, no de la documentación.
 *
 * Lo que hay que saber del endpoint `/analytics`:
 *
 *  - Devuelve `{ overview, posts[], pagination, accounts[], hasAnalyticsAccess }`.
 *  - Cada post trae `mediaType` (image/video/carousel) y `mediaProductType`
 *    (FEED/REELS). **No son lo mismo**: un reel siempre es video, pero un video
 *    puede no ser reel, y sólo el segundo campo lo distingue.
 *  - `analytics.igReelsAvgWatchTime` viene en **milisegundos**.
 *  - Sólo lista los posts para los que ya consiguió insights. Con 12 posts
 *    publicados puede devolver 3: eso es "todavía sincronizando", no "tenés 3
 *    posts", y la diferencia tiene que llegar a la pantalla.
 */

export type PostFormat = "feed" | "reel" | "story" | "other"
export type PostMediaType = "image" | "video" | "carousel" | "other"

export type NormalizedPostMetrics = {
  impressions: number
  reach: number
  likes: number
  comments: number
  shares: number
  saves: number
  views: number
  follows: number
  profileViews: number
  avgWatchTimeMs: number | null
  skipRate: number | null
}

export type NormalizedPost = {
  externalId: string
  platform: AccountPlatform
  mediaType: PostMediaType | null
  format: PostFormat
  caption: string | null
  thumbnailUrl: string | null
  permalink: string | null
  publishedAt: string | null
  videoDurationSeconds: number | null
  isAd: boolean
  metrics: NormalizedPostMetrics | null
}

export type ContentSnapshot = {
  posts: NormalizedPost[]
  /** Cuántos posts dice Zernio que hay en total, con o sin métricas. */
  totalPosts: number | null
  lastSync: string | null
  followerCount: number | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isoDate(value: unknown): string | null {
  const raw = str(value)
  if (!raw) return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

/** Entero no negativo, o el valor por defecto. Nunca NaN ni negativos. */
function count(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.trunc(value))
}

function optionalNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null
  return value
}

function mediaTypeOf(value: unknown): PostMediaType | null {
  const raw = str(value)?.toLowerCase()
  if (!raw) return null
  if (raw === "image" || raw === "video" || raw === "carousel") return raw
  return "other"
}

/**
 * El formato sale de `mediaProductType`, no del tipo de media.
 *
 * Es la distinción que decide en qué pestaña cae el contenido y qué métricas
 * tienen sentido: la retención sólo existe para reels.
 */
export function formatOf(mediaProductType: unknown, mediaType: unknown): PostFormat {
  const product = str(mediaProductType)?.toUpperCase()
  if (product === "REELS") return "reel"
  if (product === "STORY") return "story"
  if (product === "FEED") return "feed"
  // Sin `mediaProductType`, un video suelto es lo más parecido a un reel.
  return mediaTypeOf(mediaType) === "video" ? "reel" : "other"
}

export function normalizePostMetrics(input: unknown): NormalizedPostMetrics | null {
  const raw = asRecord(input)
  if (!raw) return null

  // Un objeto vacío significa "sin insights todavía", no "rindió cero".
  if (Object.keys(raw).length === 0) return null

  return {
    impressions: count(raw.impressions),
    reach: count(raw.reach),
    likes: count(raw.likes),
    comments: count(raw.comments),
    shares: count(raw.shares),
    saves: count(raw.saves),
    views: count(raw.views),
    follows: count(raw.follows),
    profileViews: count(raw.profileViews),
    avgWatchTimeMs: optionalNumber(raw.igReelsAvgWatchTime),
    skipRate: optionalNumber(raw.reelsSkipRate),
  }
}

export function normalizePost(input: unknown): NormalizedPost | null {
  const raw = asRecord(input)
  if (!raw) return null

  const externalId = str(raw._id) ?? str(raw.id)
  if (!externalId) return null

  // La miniatura puede venir suelta o dentro del primer elemento de media.
  const mediaItems = Array.isArray(raw.mediaItems) ? raw.mediaItems : []
  const primerMedia = asRecord(mediaItems[0])

  return {
    externalId,
    platform: normalizePlatform(raw.platform),
    mediaType: mediaTypeOf(raw.mediaType),
    format: formatOf(raw.mediaProductType, raw.mediaType),
    caption: str(raw.content),
    thumbnailUrl: str(raw.thumbnailUrl) ?? (primerMedia ? str(primerMedia.url) : null),
    permalink: str(raw.platformPostUrl),
    publishedAt: isoDate(raw.publishedAt) ?? isoDate(raw.scheduledFor),
    videoDurationSeconds: optionalNumber(asRecord(raw.analytics)?.videoDurationSeconds),
    isAd: raw.isAd === true,
    metrics: normalizePostMetrics(raw.analytics),
  }
}

/** Lee la respuesta completa de `/analytics`, con su contexto. */
export function parseContentPayload(payload: unknown): ContentSnapshot | null {
  const root = asRecord(payload)
  if (!root) return null

  const lista = Array.isArray(root.posts)
    ? root.posts
    : Array.isArray(root.data)
      ? root.data
      : null
  if (!lista) return null

  const overview = asRecord(root.overview)
  const cuentas = Array.isArray(root.accounts) ? root.accounts : []
  const primeraCuenta = asRecord(cuentas[0])

  return {
    posts: lista
      .map(normalizePost)
      .filter((post): post is NormalizedPost => post !== null),
    totalPosts: optionalNumber(overview?.totalPosts),
    lastSync: isoDate(overview?.lastSync),
    followerCount: primeraCuenta ? optionalNumber(primeraCuenta.followersCount) : null,
  }
}

// ------------------------------------------------------------
// Historias
// ------------------------------------------------------------

export type NormalizedStory = {
  externalId: string
  mediaType: "image" | "video" | "other" | null
  thumbnailUrl: string | null
  permalink: string | null
  postedAt: string
  expiresAt: string
}

const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000

/**
 * Historias activas.
 *
 * `expiresAt` se calcula acá porque la API no lo informa: son 24 horas desde
 * que se publicó. Sirve para saber si la foto de métricas que ya tenemos va a
 * ser la última que podamos sacar de esta historia.
 */
export function normalizeStory(input: unknown): NormalizedStory | null {
  const raw = asRecord(input)
  if (!raw) return null

  const externalId = str(raw.id) ?? str(raw._id)
  const postedAt = isoDate(raw.timestamp) ?? isoDate(raw.postedAt)
  if (!externalId || !postedAt) return null

  const tipo = str(raw.mediaType)?.toUpperCase()

  return {
    externalId,
    mediaType: tipo === "VIDEO" ? "video" : tipo === "IMAGE" ? "image" : "other",
    thumbnailUrl: str(raw.thumbnailUrl) ?? str(raw.mediaUrl),
    permalink: str(raw.permalink),
    postedAt,
    expiresAt: new Date(new Date(postedAt).getTime() + STORY_LIFETIME_MS).toISOString(),
  }
}

export function parseStoriesPayload(payload: unknown): NormalizedStory[] | null {
  const root = asRecord(payload)
  const lista = Array.isArray(payload)
    ? payload
    : root && Array.isArray(root.data)
      ? root.data
      : root && Array.isArray(root.stories)
        ? root.stories
        : null

  if (!lista) return null
  return lista.map(normalizeStory).filter((s): s is NormalizedStory => s !== null)
}

// ------------------------------------------------------------
// Seguidores
// ------------------------------------------------------------

export type FollowerStats = {
  followerCount: number | null
  gained: number | null
  lost: number | null
}

/**
 * Historia de seguidores.
 *
 * Zernio la arma con un fotógrafo diario propio, así que una cuenta recién
 * conectada devuelve ceros durante las primeras 24 horas. Por eso un total en
 * cero se traduce a `null`: mostrar "0 seguidores" sería falso cuando la
 * cuenta tiene 173.
 */
export function parseFollowerStats(payload: unknown): FollowerStats | null {
  const root = asRecord(payload)
  if (!root) return null

  const metrics = asRecord(root.metrics)
  if (!metrics) return null

  const total = (key: string): number | null => {
    const entry = asRecord(metrics[key])
    const value = entry ? optionalNumber(entry.total) : null
    return value && value > 0 ? value : null
  }

  return {
    followerCount: total("follower_count"),
    gained: total("followers_gained"),
    lost: total("followers_lost"),
  }
}
