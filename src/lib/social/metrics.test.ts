import { describe, expect, it } from "vitest"
import {
  EMPTY_METRICS,
  cadence,
  engagementRate,
  formatWatchTime,
  growth,
  interactions,
  retention,
  summarize,
  topPerformers,
  type PostSummary,
} from "./metrics"

/** Datos reales de la cuenta @operonhub, leídos de la API el 2026-09-15. */
const REEL_QUE_RETIENE = {
  ...EMPTY_METRICS,
  impressions: 78,
  reach: 52,
  likes: 1,
  views: 78,
  avgWatchTimeMs: 11398,
  skipRate: 65.4,
}

const REEL_QUE_NO_RETIENE = {
  ...EMPTY_METRICS,
  impressions: 143,
  reach: 128,
  likes: 1,
  views: 143,
  avgWatchTimeMs: 6096,
  skipRate: 84,
}

const CARRUSEL = {
  ...EMPTY_METRICS,
  impressions: 31,
  reach: 17,
  likes: 1,
  shares: 1,
  views: 31,
}

function post(overrides: Partial<PostSummary> = {}): PostSummary {
  return {
    id: "p1",
    format: "reel",
    publishedAt: "2026-06-30T12:00:00.000Z",
    videoDurationSeconds: 13,
    metrics: REEL_QUE_RETIENE,
    ...overrides,
  }
}

describe("engagementRate", () => {
  it("divide por alcance, no por impresiones", () => {
    // 2 interacciones sobre 17 personas = 11,76%. Zernio informa 6,45% porque
    // usa impresiones (31). Los dos son correctos; miden cosas distintas.
    expect(engagementRate(CARRUSEL)).toBeCloseTo(11.76, 1)
  })

  it("devuelve null sin alcance en vez de cero", () => {
    // "Todavía no hay datos" no es "no le interesó a nadie".
    expect(engagementRate({ ...EMPTY_METRICS, likes: 5 })).toBeNull()
  })

  it("cuenta guardados y compartidos como interacción", () => {
    const base = { ...EMPTY_METRICS, reach: 100 }
    expect(interactions({ ...base, likes: 1, comments: 2, shares: 3, saves: 4 })).toBe(10)
  })
})

describe("retention", () => {
  it("convierte milisegundos y duración en porcentaje mirado", () => {
    // 11,4 s de un video de 13 s.
    expect(retention(11398, 13)).toBeCloseTo(87.7, 1)
  })

  it("revela lo que las vistas esconden", () => {
    // El reel con MENOS vistas retiene mucho más. Ordenar por vistas pondría
    // primero al peor de los dos.
    const bueno = retention(REEL_QUE_RETIENE.avgWatchTimeMs, 13)
    const malo = retention(REEL_QUE_NO_RETIENE.avgWatchTimeMs, 17)
    expect(bueno).toBeGreaterThan(malo as number)
    expect(REEL_QUE_NO_RETIENE.views).toBeGreaterThan(REEL_QUE_RETIENE.views)
  })

  it("sin duración o sin tiempo de visionado no inventa un número", () => {
    expect(retention(11398, null)).toBeNull()
    expect(retention(null, 13)).toBeNull()
    expect(retention(11398, 0)).toBeNull()
  })

  it("tolera que Instagram cuente repeticiones y pase de 100%", () => {
    expect(retention(20000, 10)).toBe(200)
  })
})

describe("summarize", () => {
  const posts = [
    post({ id: "r1", metrics: REEL_QUE_RETIENE }),
    post({ id: "r2", metrics: REEL_QUE_NO_RETIENE, videoDurationSeconds: 17 }),
    post({ id: "c1", format: "feed", metrics: CARRUSEL, videoDurationSeconds: null }),
    post({ id: "sin", format: "feed", metrics: null, videoDurationSeconds: null }),
  ]

  it("suma el período y cuenta cuántos traen métricas", () => {
    const resumen = summarize(posts)
    expect(resumen.posts).toBe(4)
    expect(resumen.withMetrics).toBe(3)
    expect(resumen.reels).toBe(2)
    expect(resumen.reach).toBe(52 + 128 + 17)
    expect(resumen.views).toBe(78 + 143 + 31)
  })

  it("agrega sobre los totales en vez de promediar porcentajes", () => {
    // Promediar las tasas le daría el mismo peso a un post con 17 personas de
    // alcance que a uno con 128.
    const resumen = summarize(posts)
    const esperado = ((1 + 1 + 2) / (52 + 128 + 17)) * 100
    expect(resumen.engagementRate).toBeCloseTo(esperado, 4)
  })

  it("sin ningún post con métricas, la tasa es null", () => {
    const resumen = summarize([post({ metrics: null })])
    expect(resumen.engagementRate).toBeNull()
    expect(resumen.withMetrics).toBe(0)
  })

  it("un período vacío no rompe", () => {
    expect(summarize([]).posts).toBe(0)
    expect(summarize([]).engagementRate).toBeNull()
  })
})

describe("topPerformers", () => {
  it("ordena por tasa y no por vistas", () => {
    const ranking = topPerformers([
      post({ id: "muchas-vistas", metrics: REEL_QUE_NO_RETIENE }),
      post({ id: "buena-tasa", metrics: CARRUSEL }),
    ])
    // El carrusel tiene 31 vistas contra 143, pero mucho mejor tasa.
    expect(ranking[0].id).toBe("buena-tasa")
  })

  it("deja afuera lo que no tiene datos en vez de mostrarlo con cero", () => {
    const ranking = topPerformers([post({ id: "sin-datos", metrics: null }), post({ id: "con" })])
    expect(ranking.map((r) => r.id)).toEqual(["con"])
  })

  it("calcula la retención de cada reel del ranking", () => {
    const [primero] = topPerformers([post({ id: "r", videoDurationSeconds: 13 })])
    expect(primero.retention).toBeCloseTo(87.7, 1)
  })

  it("respeta el límite", () => {
    const muchos = Array.from({ length: 10 }, (_, i) => post({ id: `p${i}` }))
    expect(topPerformers(muchos, 3)).toHaveLength(3)
  })
})

describe("cadence", () => {
  const AHORA = new Date("2026-09-15T12:00:00.000Z")

  it("detecta que hace meses que no se publica", () => {
    // Situación real de @operonhub: el último post es del 1 de julio.
    const resultado = cadence([post({ publishedAt: "2026-07-01T20:34:52.000Z" })], 30, AHORA)
    expect(resultado.daysSinceLastPost).toBe(75)
    expect(resultado.state).toBe("frenado")
    expect(resultado.postsPerWeek).toBe(0)
  })

  it("cuenta el ritmo sobre la ventana, no sobre todo el historial", () => {
    const posts = [
      post({ id: "a", publishedAt: "2026-09-14T10:00:00.000Z" }),
      post({ id: "b", publishedAt: "2026-09-10T10:00:00.000Z" }),
      post({ id: "viejo", publishedAt: "2026-01-01T10:00:00.000Z" }),
    ]
    const resultado = cadence(posts, 30, AHORA)
    expect(resultado.state).toBe("activo")
    // 2 posts en 30 días ≈ 0,5 por semana.
    expect(resultado.postsPerWeek).toBeCloseTo(0.5, 1)
  })

  it("marca irregular entre 10 y 21 días", () => {
    expect(cadence([post({ publishedAt: "2026-09-01T10:00:00.000Z" })], 30, AHORA).state).toBe(
      "irregular"
    )
  })

  it("sin publicaciones dice sin_datos, no frenado", () => {
    const resultado = cadence([], 30, AHORA)
    expect(resultado.state).toBe("sin_datos")
    expect(resultado.daysSinceLastPost).toBeNull()
  })

  it("ignora fechas corruptas sin romper el cálculo", () => {
    const resultado = cadence(
      [post({ publishedAt: "no es fecha" }), post({ id: "ok", publishedAt: "2026-09-14T10:00:00.000Z" })],
      30,
      AHORA
    )
    expect(resultado.daysSinceLastPost).toBe(1)
  })
})

describe("growth", () => {
  it("calcula el crecimiento entre la primera y la última foto", () => {
    const resultado = growth([
      { capturedOn: "2026-09-01", value: 150 },
      { capturedOn: "2026-09-15", value: 173 },
    ])
    expect(resultado?.delta).toBe(23)
    expect(resultado?.percent).toBeCloseTo(15.33, 1)
  })

  it("ordena antes de comparar, sin confiar en el orden de entrada", () => {
    const resultado = growth([
      { capturedOn: "2026-09-15", value: 173 },
      { capturedOn: "2026-09-01", value: 150 },
    ])
    expect(resultado?.delta).toBe(23)
  })

  it("con una sola foto devuelve null, no cero", () => {
    // Es el caso real de una cuenta recién conectada: todavía no hay historia.
    expect(growth([{ capturedOn: "2026-09-15", value: 173 }])).toBeNull()
    expect(growth([])).toBeNull()
  })

  it("informa el delta aunque no pueda calcular el porcentaje desde cero", () => {
    const resultado = growth([
      { capturedOn: "2026-09-01", value: 0 },
      { capturedOn: "2026-09-15", value: 10 },
    ])
    expect(resultado?.delta).toBe(10)
    expect(resultado?.percent).toBeNull()
  })
})

describe("formatWatchTime", () => {
  it("muestra segundos legibles en vez de milisegundos", () => {
    expect(formatWatchTime(11398)).toBe("11,4 s")
  })

  it("pasa a minutos cuando corresponde", () => {
    expect(formatWatchTime(75000)).toBe("1m 15s")
  })

  it("sin dato muestra una raya", () => {
    expect(formatWatchTime(null)).toBe("—")
    expect(formatWatchTime(0)).toBe("—")
  })
})
