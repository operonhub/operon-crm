import { describe, it, expect } from "vitest"
import {
  agendaBucket,
  compareProjects,
  compareTasks,
  groupAgenda,
  isTaskOverdue,
  nextOpenTask,
  projectAlertReason,
  projectHealth,
  taskBucket,
  taskProgress,
  type AgendaItem,
  type TaskLike,
} from "./utils"

const TODAY = "2026-08-16"

function task(overrides: Partial<TaskLike> = {}): TaskLike {
  return {
    status: "pendiente",
    priority: "media",
    due_date: null,
    position: 0,
    ...overrides,
  }
}

describe("taskProgress", () => {
  it("cuenta completadas sobre el total", () => {
    const tasks = [
      task({ status: "completada" }),
      task({ status: "completada" }),
      task(),
      task({ status: "bloqueada" }),
    ]
    expect(taskProgress(tasks)).toEqual({ total: 4, done: 2, pct: 50 })
  })

  it("un proyecto sin tareas es 0%, no 100%", () => {
    expect(taskProgress([])).toEqual({ total: 0, done: 0, pct: 0 })
  })
})

describe("isTaskOverdue", () => {
  it("una tarea completada nunca está vencida", () => {
    const t = task({ status: "completada", due_date: "2026-08-01" })
    expect(isTaskOverdue(t, TODAY)).toBe(false)
  })

  it("una tarea de hoy todavía no está vencida", () => {
    expect(isTaskOverdue(task({ due_date: TODAY }), TODAY)).toBe(false)
  })

  it("una tarea sin fecha nunca está vencida", () => {
    expect(isTaskOverdue(task(), TODAY)).toBe(false)
  })

  it("acepta timestamps además de fechas planas", () => {
    const t = task({ due_date: "2026-08-01T12:00:00Z" })
    expect(isTaskOverdue(t, TODAY)).toBe(true)
  })
})

describe("taskBucket", () => {
  it("vencida gana sobre bloqueada", () => {
    const t = task({ status: "bloqueada", due_date: "2026-08-10" })
    expect(taskBucket(t, TODAY)).toBe("vencida")
  })

  it("clasifica hoy, próxima y sin fecha", () => {
    expect(taskBucket(task({ due_date: TODAY }), TODAY)).toBe("hoy")
    expect(taskBucket(task({ due_date: "2026-08-20" }), TODAY)).toBe("proxima")
    expect(taskBucket(task(), TODAY)).toBe("sin_fecha")
  })

  it("bloqueada sin fecha va a su propio bucket", () => {
    expect(taskBucket(task({ status: "bloqueada" }), TODAY)).toBe("bloqueada")
  })
})

describe("compareTasks", () => {
  it("ordena vencidas → hoy → bloqueadas → próximas → sin fecha", () => {
    const sinFecha = task()
    const proxima = task({ due_date: "2026-08-20" })
    const bloqueada = task({ status: "bloqueada" })
    const hoy = task({ due_date: TODAY })
    const vencida = task({ due_date: "2026-08-01" })

    const sorted = [sinFecha, proxima, bloqueada, hoy, vencida].sort((a, b) =>
      compareTasks(a, b, TODAY)
    )
    expect(sorted).toEqual([vencida, hoy, bloqueada, proxima, sinFecha])
  })

  it("a igual bucket y fecha, desempata por prioridad", () => {
    const baja = task({ due_date: TODAY, priority: "baja" })
    const urgente = task({ due_date: TODAY, priority: "urgente" })
    expect([baja, urgente].sort((a, b) => compareTasks(a, b, TODAY))).toEqual([
      urgente,
      baja,
    ])
  })
})

describe("nextOpenTask", () => {
  it("ignora las completadas y devuelve la más urgente", () => {
    const done = task({ status: "completada", due_date: "2026-08-01" })
    const later = task({ due_date: "2026-08-30" })
    const soon = task({ due_date: "2026-08-17" })
    expect(nextOpenTask([done, later, soon], TODAY)).toBe(soon)
  })

  it("devuelve null si no queda nada abierto", () => {
    expect(nextOpenTask([task({ status: "completada" })], TODAY)).toBeNull()
    expect(nextOpenTask([], TODAY)).toBeNull()
  })
})

describe("projectHealth", () => {
  const enCurso = { status: "en_progreso" as const, due_date: null }

  it("entrega pasada es atrasado", () => {
    const p = { status: "en_progreso" as const, due_date: "2026-08-10" }
    expect(projectHealth(p, [], TODAY)).toBe("atrasado")
  })

  it("una tarea vencida atrasa el proyecto aunque la entrega esté lejos", () => {
    const p = { status: "en_progreso" as const, due_date: "2026-12-01" }
    expect(projectHealth(p, [task({ due_date: "2026-08-01" })], TODAY)).toBe(
      "atrasado"
    )
  })

  it("atrasado gana sobre bloqueado", () => {
    const tasks = [task({ status: "bloqueada" }), task({ due_date: "2026-08-01" })]
    expect(projectHealth(enCurso, tasks, TODAY)).toBe("atrasado")
  })

  it("una tarea bloqueada bloquea el proyecto", () => {
    expect(projectHealth(enCurso, [task({ status: "bloqueada" })], TODAY)).toBe(
      "bloqueado"
    )
  })

  it("el estado revision se refleja como espera", () => {
    const p = { status: "revision" as const, due_date: null }
    expect(projectHealth(p, [task()], TODAY)).toBe("revision")
  })

  it("entrega cercana con pendientes requiere atención", () => {
    const p = { status: "en_progreso" as const, due_date: "2026-08-19" }
    expect(projectHealth(p, [task()], TODAY)).toBe("atencion")
  })

  it("entrega cercana sin pendientes está en orden", () => {
    const p = { status: "en_progreso" as const, due_date: "2026-08-19" }
    expect(projectHealth(p, [task({ status: "completada" })], TODAY)).toBe(
      "en_orden"
    )
  })

  it("un proyecto sin fecha ni tareas está en orden", () => {
    expect(projectHealth(enCurso, [], TODAY)).toBe("en_orden")
  })
})

describe("compareProjects", () => {
  it("prioriza atrasados, luego bloqueados, luego entrega más cercana", () => {
    const enOrden = { health: "en_orden" as const, due_date: null }
    const atencionLejos = { health: "atencion" as const, due_date: "2026-08-22" }
    const atencionCerca = { health: "atencion" as const, due_date: "2026-08-17" }
    const bloqueado = { health: "bloqueado" as const, due_date: null }
    const atrasado = { health: "atrasado" as const, due_date: "2026-08-01" }

    const sorted = [
      enOrden,
      atencionLejos,
      bloqueado,
      atencionCerca,
      atrasado,
    ].sort(compareProjects)

    expect(sorted).toEqual([
      atrasado,
      bloqueado,
      atencionCerca,
      atencionLejos,
      enOrden,
    ])
  })

  it("los proyectos sin fecha van después de los que tienen", () => {
    const conFecha = { health: "en_orden" as const, due_date: "2026-09-01" }
    const sinFecha = { health: "en_orden" as const, due_date: null }
    expect([sinFecha, conFecha].sort(compareProjects)).toEqual([
      conFecha,
      sinFecha,
    ])
  })
})

describe("projectAlertReason", () => {
  const base = { dueDate: null, overdueTasks: 0, blockedTasks: 0 }

  it("informa los días de atraso de la entrega", () => {
    const r = projectAlertReason(
      "atrasado",
      { ...base, dueDate: "2026-08-13" },
      TODAY
    )
    expect(r).toEqual({ severity: "critico", title: "Entrega vencida hace 3 días" })
  })

  it("usa singular con un solo día", () => {
    const r = projectAlertReason(
      "atrasado",
      { ...base, dueDate: "2026-08-15" },
      TODAY
    )
    expect(r?.title).toBe("Entrega vencida hace 1 día")
  })

  it("si la entrega no venció, reporta las tareas vencidas", () => {
    const r = projectAlertReason("atrasado", { ...base, overdueTasks: 2 }, TODAY)
    expect(r).toEqual({ severity: "critico", title: "2 tareas vencidas" })
  })

  it("reporta tareas bloqueadas", () => {
    const r = projectAlertReason("bloqueado", { ...base, blockedTasks: 1 }, TODAY)
    expect(r).toEqual({ severity: "critico", title: "1 tarea bloqueada" })
  })

  it("avisa de la entrega cercana en ámbar", () => {
    const r = projectAlertReason(
      "atencion",
      { ...base, dueDate: "2026-08-19" },
      TODAY
    )
    expect(r).toEqual({ severity: "aviso", title: "Entrega en 3 días" })
  })

  it("un proyecto en orden no genera alerta", () => {
    expect(projectAlertReason("en_orden", base, TODAY)).toBeNull()
  })

  it("revisión sin entrega cercana no genera ruido", () => {
    expect(projectAlertReason("revision", base, TODAY)).toBeNull()
    expect(
      projectAlertReason("revision", { ...base, dueDate: "2026-10-01" }, TODAY)
    ).toBeNull()
  })

  it("revisión con entrega encima sí avisa, en azul", () => {
    const r = projectAlertReason(
      "revision",
      { ...base, dueDate: "2026-08-18" },
      TODAY
    )
    expect(r).toEqual({
      severity: "espera",
      title: "Esperando revisión del cliente",
    })
  })
})

describe("agendaBucket", () => {
  it("clasifica hoy, mañana y la semana", () => {
    expect(agendaBucket(TODAY, TODAY)).toBe("hoy")
    expect(agendaBucket("2026-08-17", TODAY)).toBe("manana")
    expect(agendaBucket("2026-08-23", TODAY)).toBe("semana")
  })

  it("descarta el pasado, lo lejano y lo nulo", () => {
    expect(agendaBucket("2026-08-15", TODAY)).toBeNull()
    expect(agendaBucket("2026-08-24", TODAY)).toBeNull()
    expect(agendaBucket(null, TODAY)).toBeNull()
  })
})

describe("groupAgenda", () => {
  function item(id: string, date: string): AgendaItem {
    return { id, kind: "tarea", title: id, date, context: null, href: "#" }
  }

  it("agrupa y ordena por fecha dentro de cada grupo", () => {
    const groups = groupAgenda(
      [
        item("d", "2026-08-23"),
        item("a", TODAY),
        item("c", "2026-08-19"),
        item("b", "2026-08-17"),
        item("viejo", "2026-01-01"),
      ],
      TODAY
    )
    expect(groups.hoy.map((i) => i.id)).toEqual(["a"])
    expect(groups.manana.map((i) => i.id)).toEqual(["b"])
    expect(groups.semana.map((i) => i.id)).toEqual(["c", "d"])
  })

  it("sin items devuelve los tres grupos vacíos", () => {
    expect(groupAgenda([], TODAY)).toEqual({ hoy: [], manana: [], semana: [] })
  })
})
