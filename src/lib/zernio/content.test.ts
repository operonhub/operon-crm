import { describe, expect, it } from "vitest"
import {
  formatOf,
  normalizePost,
  normalizePostMetrics,
  parseExternalPostsPayload,
  normalizeStory,
  parseContentPayload,
  parseFollowerStats,
  parseStoriesPayload,
} from "./content"

/** Copia textual de un post de @operonhub devuelto por la API el 2026-09-15. */
const REEL_REAL = {
  _id: "6aa9ea35c86b480b122ca3de",
  content: "Tu web no debería parecer una plantilla.",
  publishedAt: "2026-06-30T18:00:00.000Z",
  status: "published",
  platform: "instagram",
  platformPostUrl: "https://www.instagram.com/reel/DaNryL5xhEx/",
  isExternal: true,
  isAd: false,
  thumbnailUrl: "https://scontent.cdninstagram.com/thumb.jpg",
  mediaType: "video",
  mediaProductType: "REELS",
  mediaItems: [{ type: "video", url: "https://cdn/video.mp4" }],
  analytics: {
    impressions: 143,
    reach: 128,
    likes: 1,
    comments: 0,
    shares: 0,
    saves: 0,
    clicks: 0,
    views: 143,
    follows: null,
    igReelsAvgWatchTime: 6096,
    igReelsVideoViewTotalTime: 999864,
    reelsSkipRate: 84,
    completionRate: 0,
    profileViews: 0,
    reposts: 0,
    videoDurationSeconds: 17,
    engagementRate: 0.7,
    lastUpdated: "2026-09-16 01:00:37",
  },
}

describe("formatOf", () => {
  it("distingue reel de video de feed", () => {
    // Un reel siempre es video, pero un video puede no ser reel: sólo
    // mediaProductType lo sabe.
    expect(formatOf("REELS", "video")).toBe("reel")
    expect(formatOf("FEED", "video")).toBe("feed")
    expect(formatOf("FEED", "carousel")).toBe("feed")
    expect(formatOf("STORY", "image")).toBe("story")
  })

  it("sin mediaProductType, un video suelto se trata como reel", () => {
    expect(formatOf(null, "video")).toBe("reel")
    expect(formatOf(undefined, "image")).toBe("other")
  })
})

describe("normalizePost", () => {
  it("normaliza un reel real completo", () => {
    const post = normalizePost(REEL_REAL)
    expect(post).toMatchObject({
      externalId: "6aa9ea35c86b480b122ca3de",
      platform: "instagram",
      mediaType: "video",
      format: "reel",
      permalink: "https://www.instagram.com/reel/DaNryL5xhEx/",
      videoDurationSeconds: 17,
      isAd: false,
    })
    expect(post?.metrics).toMatchObject({
      reach: 128,
      views: 143,
      avgWatchTimeMs: 6096,
      skipRate: 84,
    })
  })

  it("convierte un follows null en 0 sin romper", () => {
    // La API manda null en follows para los reels.
    expect(normalizePost(REEL_REAL)?.metrics?.follows).toBe(0)
  })

  it("cae a la primera pieza de media si no hay miniatura", () => {
    const post = normalizePost({ ...REEL_REAL, thumbnailUrl: "" })
    expect(post?.thumbnailUrl).toBe("https://cdn/video.mp4")
  })

  it("descarta un post sin identificador", () => {
    expect(normalizePost({ content: "sin id" })).toBeNull()
    expect(normalizePost(null)).toBeNull()
  })

  it("un post sin analytics queda con metrics en null, no en cero", () => {
    // Es la diferencia entre "Zernio todavía no trajo los insights" y
    // "esto no lo vio nadie".
    const post = normalizePost({ ...REEL_REAL, analytics: {} })
    expect(post?.metrics).toBeNull()
    expect(post?.externalId).toBe(REEL_REAL._id)
  })

  it("no inventa métricas cuando el refresco externo sólo informa la fecha", () => {
    const post = normalizePost({ ...REEL_REAL, analytics: { lastUpdated: "2026-09-24" } })
    expect(post?.metrics).toBeNull()
  })
})

describe("normalizePostMetrics", () => {
  it("ignora valores imposibles en vez de guardarlos", () => {
    const m = normalizePostMetrics({ reach: -5, likes: "muchos", views: 12.7 })
    expect(m?.reach).toBe(0)
    expect(m?.likes).toBe(0)
    expect(m?.views).toBe(12)
  })

  it("deja en null las métricas que sólo existen para reels", () => {
    const m = normalizePostMetrics({ reach: 10 })
    expect(m?.avgWatchTimeMs).toBeNull()
    expect(m?.skipRate).toBeNull()
  })
})

describe("parseContentPayload", () => {
  const RESPUESTA = {
    overview: { totalPosts: 12, publishedPosts: 12, lastSync: "2026-09-16T01:00:40.409Z" },
    posts: [REEL_REAL],
    pagination: { page: 1, limit: 50, total: 3, pages: 1 },
    accounts: [{ _id: "acc", platform: "instagram", username: "operonhub", followersCount: 173 }],
    hasAnalyticsAccess: true,
  }

  it("lee posts, total y frescura del dato", () => {
    const snapshot = parseContentPayload(RESPUESTA)
    expect(snapshot?.posts).toHaveLength(1)
    expect(snapshot?.totalPosts).toBe(12)
    expect(snapshot?.followerCount).toBe(173)
    expect(snapshot?.lastSync).toBe("2026-09-16T01:00:40.409Z")
    expect(snapshot?.page).toBe(1)
    expect(snapshot?.pages).toBe(1)
  })

  it("conserva el total aunque lleguen menos posts que ese total", () => {
    // Es el caso real: 12 publicados, 3 con insights. La pantalla necesita
    // los dos números para poder explicar la diferencia.
    const snapshot = parseContentPayload(RESPUESTA)
    expect(snapshot?.totalPosts).toBe(12)
    expect(snapshot?.posts.length).toBeLessThan(snapshot?.totalPosts ?? 0)
  })

  it("devuelve null si el formato es desconocido", () => {
    expect(parseContentPayload({ resultado: "ok" })).toBeNull()
    expect(parseContentPayload(null)).toBeNull()
  })

  it("cero posts es una lista vacía, no un error", () => {
    expect(parseContentPayload({ posts: [] })?.posts).toEqual([])
  })
})

describe("parseExternalPostsPayload", () => {
  it("conserva posts recientes aunque todavía no tengan insights", () => {
    const posts = parseExternalPostsPayload({
      synced: { postsFound: 12 },
      posts: [{ ...REEL_REAL, analytics: { lastUpdated: "2026-09-24" } }],
    })
    expect(posts).toHaveLength(1)
    expect(posts?.[0]?.metrics).toBeNull()
  })

  it("rechaza una respuesta sin lista de posts", () => {
    expect(parseExternalPostsPayload({ synced: {} })).toBeNull()
  })
})

describe("historias", () => {
  const STORY = {
    id: "st_1",
    mediaType: "VIDEO",
    mediaProductType: "STORY",
    permalink: "https://instagram.com/stories/operonhub/1",
    thumbnailUrl: "https://cdn/story.jpg",
    timestamp: "2026-09-15T10:00:00.000Z",
  }

  it("calcula el vencimiento a 24 horas de publicada", () => {
    // La API no lo informa; sin esto no se sabe si la foto de métricas que
    // tenemos va a ser la última que podamos sacar.
    const story = normalizeStory(STORY)
    expect(story?.expiresAt).toBe("2026-09-16T10:00:00.000Z")
  })

  it("descarta una historia sin fecha", () => {
    expect(normalizeStory({ id: "st", mediaType: "IMAGE" })).toBeNull()
  })

  it("lee la lista vacía que devuelve la cuenta sin historias activas", () => {
    // Respuesta textual de la API: `{ data: [] }`.
    expect(parseStoriesPayload({ data: [] })).toEqual([])
  })

  it("distingue lista vacía de formato desconocido", () => {
    expect(parseStoriesPayload({ otra: "cosa" })).toBeNull()
  })
})

describe("parseFollowerStats", () => {
  it("traduce los ceros de una cuenta recién conectada a null", () => {
    // Respuesta real: la cuenta tiene 173 seguidores pero el fotógrafo diario
    // de Zernio todavía no corrió. Mostrar "0" sería mentir.
    const stats = parseFollowerStats({
      metrics: {
        follower_count: { total: 0 },
        followers_gained: { total: 0 },
        followers_lost: { total: 0 },
      },
    })
    expect(stats).toEqual({ followerCount: null, gained: null, lost: null })
  })

  it("lee los valores cuando ya hay historia", () => {
    const stats = parseFollowerStats({
      metrics: {
        follower_count: { total: 173 },
        followers_gained: { total: 8 },
        followers_lost: { total: 2 },
      },
    })
    expect(stats).toEqual({ followerCount: 173, gained: 8, lost: 2 })
  })

  it("devuelve null ante un formato inesperado", () => {
    expect(parseFollowerStats({ success: true })).toBeNull()
  })
})
