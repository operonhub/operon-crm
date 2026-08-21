import { describe, expect, it } from "vitest"
import { canPerform, roleLabel } from "./permissions"

describe("permisos internos", () => {
  it("muestra los roles actuales con lenguaje de producto", () => {
    expect(roleLabel("admin")).toBe("Fundador/admin")
    expect(roleLabel("operador")).toBe("Miembro")
  })

  it("permite colaborar y operar a miembros", () => {
    expect(canPerform("operador", "collaboration.write")).toBe(true)
    expect(canPerform("operador", "task.write")).toBe(true)
    expect(canPerform("operador", "opportunity.write")).toBe(true)
  })

  it("reserva finanzas, agentes y archivado para administradores", () => {
    expect(canPerform("operador", "finance.write")).toBe(false)
    expect(canPerform("operador", "agent.configure")).toBe(false)
    expect(canPerform("operador", "record.archive")).toBe(false)
    expect(canPerform("admin", "finance.write")).toBe(true)
    expect(canPerform("admin", "agent.approve")).toBe(true)
  })
})
