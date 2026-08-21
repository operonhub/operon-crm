import { describe, expect, it } from "vitest"
import { CONTEXT_TYPES } from "./request"
import {
  CONNECTION_LABELS,
  conversationGroups,
  connectionLabel,
  greetingFor,
  parseBlocks,
  pathToContext,
} from "./ui"

const UUID = "aaaaaaaa-1111-2222-3333-444444444444"

describe("pathToContext", () => {
  it("reconoce las secciones del CRM con su entidad", () => {
    expect(pathToContext(`/proyectos/${UUID}`)).toEqual({ type: "project", id: UUID })
    expect(pathToContext(`/clientes/${UUID}`)).toEqual({ type: "client", id: UUID })
    expect(pathToContext(`/oportunidades/${UUID}`)).toEqual({
      type: "opportunity",
      id: UUID,
    })
  })

  it("reconoce las secciones sin entidad", () => {
    expect(pathToContext("/")).toEqual({ type: "dashboard", id: null })
    expect(pathToContext("/finanzas")).toEqual({ type: "finance", id: null })
    expect(pathToContext("/bandeja")).toEqual({ type: "inbox", id: null })
    expect(pathToContext("/agentes")).toEqual({ type: "agent", id: null })
    expect(pathToContext("/proyectos")).toEqual({ type: "project", id: null })
  })

  it("una sección sin contexto propio cae en general", () => {
    expect(pathToContext("/metricas")).toEqual({ type: "general", id: null })
    expect(pathToContext("/organizaciones")).toEqual({ type: "general", id: null })
  })

  it("leads no tiene tipo propio: va como general y sin id", () => {
    // El servidor no acepta 'lead' en CONTEXT_TYPES; mandar el id igual sería
    // decir que estamos en un contexto que el backend no puede validar.
    expect(pathToContext(`/leads/${UUID}`)).toEqual({ type: "general", id: null })
  })

  it("descarta un segmento que no sea un identificador válido", () => {
    expect(pathToContext("/proyectos/nuevo")).toEqual({ type: "project", id: null })
    expect(pathToContext("/clientes/1;drop")).toEqual({ type: "client", id: null })
  })

  it("nunca devuelve un tipo que el servidor no acepte", () => {
    const rutas = [
      "/",
      "/finanzas",
      "/bandeja",
      "/agentes",
      "/metricas",
      "/organizaciones",
      `/proyectos/${UUID}`,
      `/clientes/${UUID}`,
      `/oportunidades/${UUID}`,
      `/leads/${UUID}`,
      "/ruta/que/no/existe",
      "",
    ]
    for (const ruta of rutas) {
      expect(CONTEXT_TYPES).toContain(pathToContext(ruta).type)
    }
  })
})

describe("greetingFor", () => {
  const tarde = new Date("2026-08-21T18:00:00Z") // 15:00 en Argentina

  it("usa el nombre que la persona eligió", () => {
    const saludo = greetingFor({
      preferredName: "quemero",
      fullName: "Santiago Guatelli",
      seed: 0,
      now: tarde,
    })
    expect(saludo).toContain("quemero")
    expect(saludo).not.toContain("Santiago")
  })

  it("si no eligió nombre, usa el primero de su nombre real", () => {
    const saludo = greetingFor({
      preferredName: "",
      fullName: "Santiago Guatelli",
      seed: 0,
      now: tarde,
    })
    expect(saludo).toContain("Santiago")
    expect(saludo).not.toContain("Guatelli")
  })

  it("sin ningún nombre, no queda un hueco raro", () => {
    const saludo = greetingFor({ preferredName: "", fullName: "", seed: 0, now: tarde })
    expect(saludo).not.toContain("{")
    expect(saludo).not.toContain("undefined")
    expect(saludo.length).toBeGreaterThan(0)
  })

  it("incluye el saludo según la hora de Argentina", () => {
    const manana = new Date("2026-08-21T12:00:00Z") // 09:00 en Argentina
    expect(greetingFor({ preferredName: "Tomi", fullName: "", seed: 0, now: manana }))
      .toMatch(/Buen día/)
    expect(greetingFor({ preferredName: "Tomi", fullName: "", seed: 0, now: tarde }))
      .toMatch(/Buenas tardes/)
  })

  it("la misma semilla da siempre la misma frase", () => {
    const args = { preferredName: "Tomi", fullName: "", seed: 3, now: tarde }
    expect(greetingFor(args)).toBe(greetingFor(args))
  })

  it("semillas distintas rotan la frase", () => {
    const base = { preferredName: "Tomi", fullName: "", now: tarde }
    const frases = new Set(
      [0, 1, 2, 3, 4].map((seed) => greetingFor({ ...base, seed }))
    )
    expect(frases.size).toBeGreaterThan(1)
  })

  it("un nombre largo no rompe la plantilla", () => {
    const largo = "a".repeat(60)
    expect(greetingFor({ preferredName: largo, fullName: "", seed: 0, now: tarde }))
      .toContain(largo)
  })
})

describe("connectionLabel", () => {
  it("dice la verdad en cada estado", () => {
    expect(connectionLabel({ configured: false, status: "idle" }).text).toMatch(
      /sin conectar/i
    )
    expect(connectionLabel({ configured: true, status: "idle" }).text).toMatch(/listo/i)
    expect(connectionLabel({ configured: true, status: "streaming" }).text).toMatch(
      /respondiendo/i
    )
    expect(connectionLabel({ configured: true, status: "error" }).text).toMatch(
      /sin respuesta/i
    )
  })

  it("el texto sale siempre de un conjunto cerrado", () => {
    // Esto es lo que impide mecánicamente que reaparezca algo como
    // "42 tools" o "n8n conectado": no hay forma de devolver texto libre.
    for (const configured of [true, false]) {
      for (const status of ["idle", "streaming", "error"] as const) {
        const { text } = connectionLabel({ configured, status })
        expect(CONNECTION_LABELS).toContain(text)
      }
    }
  })

  it("ninguna etiqueta afirma capacidades que no existen", () => {
    const prohibido = /n8n|CRM conectado|\d+\s*tools?|herramientas? conectad/i
    for (const label of CONNECTION_LABELS) {
      expect(label).not.toMatch(prohibido)
    }
  })
})

describe("conversationGroups", () => {
  const HOY = "2026-08-21"

  function conv(id: string, fecha: string) {
    return { id, title: id, updated_at: `${fecha}T12:00:00Z` }
  }

  it("agrupa en hoy, ayer y anteriores", () => {
    const grupos = conversationGroups(
      [
        conv("a", "2026-08-21"),
        conv("b", "2026-08-20"),
        conv("c", "2026-08-01"),
        conv("d", "2026-08-21"),
      ],
      HOY
    )
    expect(grupos.map((g) => g.label)).toEqual(["Hoy", "Ayer", "Anteriores"])
    expect(grupos[0].items.map((i) => i.id)).toEqual(["a", "d"])
    expect(grupos[1].items.map((i) => i.id)).toEqual(["b"])
    expect(grupos[2].items.map((i) => i.id)).toEqual(["c"])
  })

  it("no muestra grupos vacíos", () => {
    const grupos = conversationGroups([conv("a", HOY)], HOY)
    expect(grupos).toHaveLength(1)
    expect(grupos[0].label).toBe("Hoy")
  })

  it("sin conversaciones devuelve una lista vacía", () => {
    expect(conversationGroups([], HOY)).toEqual([])
  })

  it("una conversación del futuro cuenta como hoy, no se pierde", () => {
    const grupos = conversationGroups([conv("a", "2026-12-31")], HOY)
    expect(grupos[0].items.map((i) => i.id)).toEqual(["a"])
  })
})

describe("parseBlocks", () => {
  it("separa párrafos", () => {
    const bloques = parseBlocks("Primero.\n\nSegundo.")
    expect(bloques).toHaveLength(2)
    expect(bloques.every((b) => b.type === "paragraph")).toBe(true)
  })

  it("reconoce listas con guiones y numeradas", () => {
    const conGuion = parseBlocks("- uno\n- dos")
    expect(conGuion[0]).toMatchObject({ type: "list", ordered: false })
    expect((conGuion[0] as { items: unknown[] }).items).toHaveLength(2)

    const numerada = parseBlocks("1. uno\n2. dos")
    expect(numerada[0]).toMatchObject({ type: "list", ordered: true })
  })

  it("reconoce bloques de código con su lenguaje", () => {
    const bloques = parseBlocks("```sql\nselect 1;\n```")
    expect(bloques[0]).toEqual({
      type: "code",
      language: "sql",
      content: "select 1;",
    })
  })

  it("un bloque de código sin cerrar no se traga el resto en silencio", () => {
    const bloques = parseBlocks("```\nsin cerrar")
    expect(bloques[0]).toMatchObject({ type: "code", content: "sin cerrar" })
  })

  it("marca negritas y código en línea", () => {
    const [bloque] = parseBlocks("Esto es **importante** y esto `codigo`.")
    const partes = (bloque as { parts: { type: string }[] }).parts
    expect(partes.some((p) => p.type === "bold")).toBe(true)
    expect(partes.some((p) => p.type === "code")).toBe(true)
  })

  it("convierte URLs en enlaces sin comerse la puntuación final", () => {
    const [bloque] = parseBlocks("Mirá https://operon.dev/docs.")
    const partes = (bloque as { parts: { type: string; href?: string }[] }).parts
    const link = partes.find((p) => p.type === "link")
    expect(link?.href).toBe("https://operon.dev/docs")
    // El punto final es de la oración, no del enlace.
    expect(partes.at(-1)).toMatchObject({ type: "text", value: "." })
  })

  it("no deja pasar HTML: devuelve datos, nunca marcado", () => {
    const bloques = parseBlocks("<script>alert(1)</script> y <b>negrita</b>")
    const json = JSON.stringify(bloques)
    // El texto se conserva tal cual (React lo escapa al renderizar), pero
    // ninguna parte se marca como algo que deba interpretarse como HTML.
    expect(json).not.toContain('"html"')
    expect(bloques.every((b) => ["paragraph", "list", "code"].includes(b.type))).toBe(
      true
    )
  })

  it("texto vacío no genera bloques", () => {
    expect(parseBlocks("")).toEqual([])
    expect(parseBlocks("   \n\n  ")).toEqual([])
  })
})
