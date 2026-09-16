/**
 * Métricas derivadas de redes sociales.
 *
 * Módulo **puro**, sin JSX ni base, igual que `src/lib/pipeline/funnel.ts`:
 * las decisiones de qué significa "rindió bien" se prueban sin navegador.
 *
 * Todo lo de acá contesta una sola pregunta: *qué conviene publicar la próxima
 * vez*. Cualquier número que no ayude a decidir eso no va.
 */

export type PostMetrics = {
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

export type PostSummary = {
  id: string
  format: "feed" | "reel" | "story" | "other"
  publishedAt: string | null
  videoDurationSeconds: number | null
  metrics: PostMetrics | null
}

export const EMPTY_METRICS: PostMetrics = {
  impressions: 0,
  reach: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  saves: 0,
  views: 0,
  follows: 0,
  profileViews: 0,
  avgWatchTimeMs: null,
  skipRate: null,
}

/** Todo lo que una persona hizo activamente con la publicación. */
export function interactions(metrics: PostMetrics): number {
  return metrics.likes + metrics.comments + metrics.shares + metrics.saves
}

/**
 * Interacciones sobre **alcance**, no sobre impresiones.
 *
 * El alcance son personas distintas; las impresiones cuentan repeticiones. Usar
 * impresiones abarata el número cuando alguien ve el mismo post tres veces, y
 * la pregunta que importa es qué proporción de la gente que lo vio hizo algo.
 *
 * Ojo: Instagram y Zernio informan su propio engagement rate sobre impresiones,
 * así que este número va a ser más alto que el de ellos. Por eso en la UI se
 * rotula "interacciones / alcance" y no "engagement" a secas.
 *
 * Devuelve `null` —no cero— cuando no hay alcance: "no sé" y "nadie interactuó"
 * son cosas distintas y no se pueden promediar juntas.
 */
export function engagementRate(metrics: PostMetrics): number | null {
  if (metrics.reach <= 0) return null
  return (interactions(metrics) / metrics.reach) * 100
}

/**
 * Qué porcentaje del video se mira en promedio.
 *
 * Es la métrica más útil de un reel y la que más se ignora, porque las vistas
 * premian al que tiene mejor portada mientras que la retención mide si el
 * contenido aguanta. Un reel de 13 s con 11 s de visionado promedio (85%)
 * funciona mucho mejor que uno de 17 s con 6 s (36%), aunque el segundo tenga
 * el doble de vistas.
 *
 * `avgWatchTimeMs` llega en milisegundos desde Instagram.
 */
export function retention(
  avgWatchTimeMs: number | null,
  durationSeconds: number | null
): number | null {
  if (!avgWatchTimeMs || !durationSeconds || durationSeconds <= 0) return null
  const pct = (avgWatchTimeMs / 1000 / durationSeconds) * 100
  // Instagram cuenta las repeticiones, así que puede pasar del 100%.
  return Math.min(pct, 999)
}

export type PeriodSummary = {
  posts: number
  reels: number
  reach: number
  views: number
  interactions: number
  /** null cuando ningún post del período tiene alcance informado. */
  engagementRate: number | null
  newFollows: number
  profileViews: number
  /** Cuántos del total llegaron con métricas. */
  withMetrics: number
}

export function summarize(posts: PostSummary[]): PeriodSummary {
  const conMetricas = posts.filter((post) => post.metrics !== null)

  const totals = conMetricas.reduce(
    (acc, post) => {
      const m = post.metrics as PostMetrics
      acc.reach += m.reach
      acc.views += m.views
      acc.interactions += interactions(m)
      acc.newFollows += m.follows
      acc.profileViews += m.profileViews
      return acc
    },
    { reach: 0, views: 0, interactions: 0, newFollows: 0, profileViews: 0 }
  )

  return {
    posts: posts.length,
    reels: posts.filter((post) => post.format === "reel").length,
    ...totals,
    // Se agrega sobre los totales y no promediando los porcentajes de cada
    // post: promediar porcentajes le daría el mismo peso a uno con 3 000
    // visualizaciones que a uno con 12.
    engagementRate: totals.reach > 0 ? (totals.interactions / totals.reach) * 100 : null,
    withMetrics: conMetricas.length,
  }
}

export type RankedPost = PostSummary & {
  engagementRate: number
  retention: number | null
}

/**
 * Mejor rendimiento, ordenado por tasa de interacción.
 *
 * NO por vistas: las vistas se acumulan con el tiempo, así que un ranking por
 * vistas brutas es en realidad un ranking por antigüedad disfrazado. Ordenar
 * por tasa pone arriba lo que mejor funcionó, sin importar cuándo salió.
 *
 * Los posts sin alcance informado quedan afuera en lugar de aparecer con cero:
 * "todavía no hay datos" no es "rindió mal".
 */
export function topPerformers(posts: PostSummary[], limit = 5): RankedPost[] {
  return posts
    .flatMap((post) => {
      if (!post.metrics) return []
      const rate = engagementRate(post.metrics)
      if (rate === null) return []
      return [
        {
          ...post,
          engagementRate: rate,
          retention: retention(post.metrics.avgWatchTimeMs, post.videoDurationSeconds),
        },
      ]
    })
    .sort((a, b) => b.engagementRate - a.engagementRate)
    .slice(0, limit)
}

export type Cadence = {
  /** Días desde la última publicación. null si nunca publicó. */
  daysSinceLastPost: number | null
  postsPerWeek: number
  lastPublishedAt: string | null
  /**
   * El algoritmo de Instagram premia la constancia, así que un hueco largo
   * importa más que el conteo del mes.
   */
  state: "sin_datos" | "activo" | "irregular" | "frenado"
}

const DAY_MS = 86_400_000

/**
 * Ritmo de publicación sobre una ventana móvil.
 *
 * Es la métrica que más incomoda y la más útil: el resto del panel puede verse
 * bien mientras hace dos meses que no sale nada.
 */
export function cadence(
  posts: PostSummary[],
  windowDays = 30,
  now: Date = new Date()
): Cadence {
  const fechas = posts
    .map((post) => post.publishedAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())

  if (fechas.length === 0) {
    return { daysSinceLastPost: null, postsPerWeek: 0, lastPublishedAt: null, state: "sin_datos" }
  }

  const ultima = fechas[0]
  const daysSinceLastPost = Math.floor((now.getTime() - ultima.getTime()) / DAY_MS)

  const desde = now.getTime() - windowDays * DAY_MS
  const enVentana = fechas.filter((date) => date.getTime() >= desde).length
  const postsPerWeek = (enVentana / windowDays) * 7

  const state: Cadence["state"] =
    daysSinceLastPost > 21 ? "frenado" : daysSinceLastPost > 10 ? "irregular" : "activo"

  return {
    daysSinceLastPost,
    postsPerWeek: Math.round(postsPerWeek * 10) / 10,
    lastPublishedAt: ultima.toISOString(),
    state,
  }
}

export type Snapshot = { capturedOn: string; value: number }

/**
 * Cuánto creció una serie entre su primera y su última foto.
 *
 * Con una sola foto devuelve `null` en vez de cero: no se puede hablar de
 * evolución con un solo punto, y un cero ahí se leería como "no creció".
 */
export function growth(snapshots: Snapshot[]): { delta: number; percent: number | null } | null {
  if (snapshots.length < 2) return null

  const ordenadas = [...snapshots].sort((a, b) => a.capturedOn.localeCompare(b.capturedOn))
  const primera = ordenadas[0].value
  const ultima = ordenadas[ordenadas.length - 1].value
  const delta = ultima - primera

  return { delta, percent: primera > 0 ? (delta / primera) * 100 : null }
}

/** Milisegundos a "6,1 s", para no mostrar 6096 en pantalla. */
export function formatWatchTime(ms: number | null): string {
  if (!ms) return "—"
  const seconds = ms / 1000
  return seconds >= 60
    ? `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
    : `${seconds.toFixed(1).replace(".", ",")} s`
}
