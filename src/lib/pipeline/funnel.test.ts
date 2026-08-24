import { describe, expect, it } from "vitest"
import {
  funnelWidths,
  nextActionOf,
  reachedShares,
  stalenessOf,
} from "./funnel"

describe("funnelWidths", () => {
  it("da más ancho a la etapa con más fichas", () => {
    const [a, b, c] = funnelWidths([5, 2, 1])
    expect(a).toBeGreaterThan(b)
    expect(b).toBeGreaterThan(c)
  })

  it("una etapa vacía conserva ancho, no colapsa", () => {
    // Si colapsara a cero dejaría de ser un destino visible para arrastrar,
    // y el embudo ocultaría justo lo que hay que ver: que no hay nada ahí.
    const [vacia] = funnelWidths([0, 4])
    expect(vacia).toBeGreaterThan(0)
  })

  it("con el pipeline vacío todas las etapas miden igual", () => {
    const anchos = funnelWidths([0, 0, 0, 0])
    expect(new Set(anchos).size).toBe(1)
  })

  it("la diferencia de ancho es proporcional a la de fichas", () => {
    const [uno, dos, tres] = funnelWidths([1, 2, 3])
    expect(dos - uno).toBe(tres - dos)
  })
})

describe("reachedShares", () => {
  it("la primera etapa siempre es el 100% del pipeline", () => {
    expect(reachedShares([5, 4, 3, 2, 1])[0]).toBe(100)
  })

  it("baja a medida que el embudo se angosta", () => {
    const shares = reachedShares([5, 3, 2])
    expect(shares).toEqual([100, 50, 20])
    for (let i = 1; i < shares.length; i++) {
      expect(shares[i]).toBeLessThanOrEqual(shares[i - 1])
    }
  })

  it("una etapa vacía en el medio no rompe la cuenta", () => {
    expect(reachedShares([4, 0, 1])).toEqual([100, 20, 20])
  })

  it("sin oportunidades devuelve cero y no divide por cero", () => {
    expect(reachedShares([0, 0, 0])).toEqual([0, 0, 0])
  })
})

describe("stalenessOf", () => {
  const HOY = "2026-08-21"

  it("distingue hoy, ayer y hace varios días", () => {
    expect(stalenessOf("2026-08-21T10:00:00Z", HOY).label).toBe("Hoy")
    expect(stalenessOf("2026-08-20T10:00:00Z", HOY).label).toBe("Ayer")
    expect(stalenessOf("2026-08-16T10:00:00Z", HOY).label).toBe("Hace 5 días")
  })

  it("escala de reciente a helado a medida que pasan los días", () => {
    const nivel = (fecha: string) => stalenessOf(`${fecha}T12:00:00Z`, HOY).level
    expect(nivel("2026-08-21")).toBe("hoy") //  0 días
    expect(nivel("2026-08-20")).toBe("reciente") //  1
    expect(nivel("2026-08-19")).toBe("reciente") //  2
    expect(nivel("2026-08-18")).toBe("tibio") //  3 ← primer umbral
    expect(nivel("2026-08-15")).toBe("tibio") //  6
    expect(nivel("2026-08-14")).toBe("frio") //  7 ← segundo umbral
    expect(nivel("2026-08-08")).toBe("frio") // 13
    expect(nivel("2026-08-07")).toBe("helado") // 14 ← tercer umbral
  })

  it("sin actividad registrada lo dice, no finge un cero", () => {
    // Mostrar "hace 0 días" cuando nunca pasó nada seria mentir sobre el
    // estado del trato: son cosas distintas y se leen distinto.
    const sin = stalenessOf(null, HOY)
    expect(sin.level).toBe("sin-registro")
    expect(sin.days).toBeNull()
    expect(sin.label).toMatch(/sin actividad/i)
  })

  /**
   * Argentina va tres horas atrás de UTC, así que lo que pasa después de las
   * 21:00 ya figura como el día siguiente en UTC. Usar la fecha cruda del
   * timestamp mostraría algo de anoche como si fuera de mañana.
   */
  it("cuenta los días con el calendario argentino, no el UTC", () => {
    // 22:00 del 20 en Argentina = 01:00 del 21 en UTC.
    expect(stalenessOf("2026-08-21T01:00:00Z", HOY).label).toBe("Ayer")
    // 00:30 del 21 en Argentina = 03:30 del 21 en UTC.
    expect(stalenessOf("2026-08-21T03:30:00Z", HOY).label).toBe("Hoy")
  })

  it("una fecha futura cuenta como hoy, no como un negativo", () => {
    const futuro = stalenessOf("2026-09-01T12:00:00Z", HOY)
    expect(futuro.level).toBe("hoy")
    expect(futuro.days).toBe(0)
  })

  it("una fecha ilegible no rompe la ficha", () => {
    expect(stalenessOf("no-es-una-fecha", HOY).level).toBe("sin-registro")
  })
})

describe("nextActionOf", () => {
  const HOY = "2026-08-21"

  it("marca vencida, hoy y próxima", () => {
    expect(nextActionOf("Llamar", "2026-08-20", HOY).state).toBe("vencida")
    expect(nextActionOf("Llamar", "2026-08-21", HOY).state).toBe("hoy")
    expect(nextActionOf("Llamar", "2026-08-25", HOY).state).toBe("proxima")
  })

  it("sin acción definida es un estado propio, no una acción vacía", () => {
    // En una etapa activa significa que nadie está empujando el trato, y la
    // interfaz lo muestra tan fuerte como una acción vencida.
    expect(nextActionOf(null, null, HOY).state).toBe("sin-definir")
    expect(nextActionOf("   ", "2026-08-25", HOY).state).toBe("sin-definir")
  })

  it("una acción sin fecha no se inventa un vencimiento", () => {
    expect(nextActionOf("Llamar", null, HOY)).toEqual({
      state: "proxima",
      label: "Llamar",
    })
  })

  it("acepta una fecha con hora sin confundir el día", () => {
    expect(nextActionOf("Llamar", "2026-08-21T00:00:00Z", HOY).state).toBe("hoy")
  })
})
