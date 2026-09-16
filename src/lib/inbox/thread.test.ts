import { describe, expect, it } from "vitest"
import {
  AVATAR_TONES,
  avatarTone,
  dayLabel,
  isPhoneLike,
  groupThread,
  initials,
  placeholderKind,
  readAttachments,
  type ThreadMessage,
} from "./thread"

// 16 de septiembre de 2026, 15:00 en Argentina (18:00 UTC).
const AHORA = new Date("2026-09-16T18:00:00.000Z")

function msg(id: string, direction: "inbound" | "outbound", sentAt: string): ThreadMessage {
  return {
    id,
    direction,
    body: `mensaje ${id}`,
    delivery_status: "delivered",
    sent_at: sentAt,
    deleted_at: null,
    sender: null,
  }
}

describe("dayLabel", () => {
  it("usa el día de Argentina, no el de UTC", () => {
    // 01:30 UTC del 16 son las 22:30 del 15 en Argentina: es "Ayer", no "Hoy".
    expect(dayLabel("2026-09-16T01:30:00.000Z", AHORA)).toBe("Ayer")
  })

  it("dice Hoy y Ayer", () => {
    expect(dayLabel("2026-09-16T12:00:00.000Z", AHORA)).toBe("Hoy")
    expect(dayLabel("2026-09-15T12:00:00.000Z", AHORA)).toBe("Ayer")
  })

  it("muestra la fecha corta más atrás, y el año sólo si no es el actual", () => {
    expect(dayLabel("2026-06-12T15:00:00.000Z", AHORA)).toMatch(/12.*jun/)
    expect(dayLabel("2025-06-12T15:00:00.000Z", AHORA)).toMatch(/2025/)
  })
})

describe("groupThread", () => {
  it("separa por día", () => {
    const grupos = groupThread(
      [msg("a", "inbound", "2026-09-15T15:00:00.000Z"), msg("b", "inbound", "2026-09-16T15:00:00.000Z")],
      AHORA
    )
    expect(grupos.map((g) => g.label)).toEqual(["Ayer", "Hoy"])
  })

  it("pega los mensajes seguidos del mismo lado", () => {
    const [grupo] = groupThread(
      [
        msg("a", "inbound", "2026-09-16T15:00:00.000Z"),
        msg("b", "inbound", "2026-09-16T15:01:00.000Z"),
        msg("c", "inbound", "2026-09-16T15:02:00.000Z"),
      ],
      AHORA
    )
    expect(grupo.messages.map((m) => [m.joinsPrevious, m.joinsNext])).toEqual([
      [false, true],
      [true, true],
      [true, false],
    ])
  })

  it("no pega mensajes de lados distintos", () => {
    const [grupo] = groupThread(
      [msg("a", "inbound", "2026-09-16T15:00:00.000Z"), msg("b", "outbound", "2026-09-16T15:00:30.000Z")],
      AHORA
    )
    expect(grupo.messages.every((m) => !m.joinsPrevious && !m.joinsNext)).toBe(true)
  })

  it("no pega mensajes del mismo lado separados por más de cinco minutos", () => {
    const [grupo] = groupThread(
      [msg("a", "inbound", "2026-09-16T15:00:00.000Z"), msg("b", "inbound", "2026-09-16T15:10:00.000Z")],
      AHORA
    )
    expect(grupo.messages[1].joinsPrevious).toBe(false)
  })

  it("no pega mensajes cercanos que cruzan la medianoche", () => {
    // 23:58 y 00:01 en Argentina: tres minutos, pero distinto día y separador.
    const grupos = groupThread(
      [msg("a", "inbound", "2026-09-16T02:58:00.000Z"), msg("b", "inbound", "2026-09-16T03:01:00.000Z")],
      AHORA
    )
    expect(grupos).toHaveLength(2)
    expect(grupos[1].messages[0].joinsPrevious).toBe(false)
  })

  it("un hilo vacío no rompe", () => {
    expect(groupThread([], AHORA)).toEqual([])
  })
})

describe("readAttachments", () => {
  it("reconoce imágenes con URL segura", () => {
    expect(readAttachments([{ type: "image", url: "https://cdn/x.jpg" }])).toEqual([
      { kind: "image", url: "https://cdn/x.jpg", name: null },
    ])
  })

  it("descarta URLs que no son https", () => {
    // Un adjunto viene de afuera: nada de javascript: ni http plano en un src.
    expect(readAttachments([{ type: "image", url: "javascript:alert(1)" }])[0].url).toBeNull()
    expect(readAttachments([{ type: "image", url: "http://cdn/x.jpg" }])[0].url).toBeNull()
  })

  it("tolera basura sin romper", () => {
    expect(readAttachments(null)).toEqual([])
    expect(readAttachments([null, 3, "x"])).toEqual([])
  })
})

describe("placeholderKind", () => {
  it("detecta los textos que pone Zernio cuando no expone el contenido", () => {
    expect(placeholderKind("[Unsupported message]")).toBe("unsupported")
    expect(placeholderKind("[Attachment]")).toBe("attachment")
  })

  it("no confunde un mensaje real que menciona un adjunto", () => {
    expect(placeholderKind("te mando el [adjunto] mañana")).toBeNull()
    expect(placeholderKind(null)).toBeNull()
  })
})

describe("initials", () => {
  it("toma primera y última palabra", () => {
    expect(initials("Jonás Zandanel")).toBe("JZ")
    expect(initials("lu.viajes")).toBe("L")
  })

  it("un número de teléfono no tiene iniciales", () => {
    expect(initials("5493874570554")).toBe("#")
  })

  it("sin nombre muestra un signo", () => {
    expect(initials(null)).toBe("?")
  })
})

describe("avatarTone", () => {
  it("es estable: el mismo contacto siempre del mismo color", () => {
    expect(avatarTone("Bosques del Sur")).toBe(avatarTone("Bosques del Sur"))
  })

  it("reparte contactos distintos entre los tonos disponibles", () => {
    const nombres = ["Lucía", "Jonás Zandanel", "Bosques del Sur", "Amaneceres", "Mati", "Rodrigo", "Jimena", "Hugo"]
    const tonos = new Set(nombres.map(avatarTone))
    expect(tonos.size).toBeGreaterThan(2)
    nombres.forEach((n) => expect(avatarTone(n)).toBeLessThan(AVATAR_TONES))
  })

  it("tolera un contacto sin nombre", () => {
    expect(avatarTone(null)).toBe(0)
  })
})

describe("isPhoneLike", () => {
  it("reconoce números con y sin formato", () => {
    expect(isPhoneLike("5493874570554")).toBe(true)
    expect(isPhoneLike("+54 9 11 7238-5877")).toBe(true)
  })

  it("no confunde un nombre o un usuario con un teléfono", () => {
    expect(isPhoneLike("Jonás Zandanel")).toBe(false)
    expect(isPhoneLike("lu.viajes2024")).toBe(false)
    expect(isPhoneLike("123")).toBe(false)
    expect(isPhoneLike(null)).toBe(false)
  })
})
