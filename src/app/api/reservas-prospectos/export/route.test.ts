import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "./route"
import { AuthorizationError } from "@/lib/auth"
import { ReservasExportLimitError } from "@/lib/reservas-sales-server"

const mocks = vi.hoisted(() => ({ requireMember: vi.fn(), loadExport: vi.fn() }))
vi.mock("@/lib/auth", () => ({ requireMember: mocks.requireMember,
  AuthorizationError: class extends Error { constructor(message: string, readonly status: number) { super(message) } } }))
vi.mock("@/lib/reservas-sales-server", () => ({ loadReservasExport: mocks.loadExport, ReservasExportLimitError: class extends Error {} }))

beforeEach(() => {
  mocks.requireMember.mockReset().mockResolvedValue({ supabase: {} })
  mocks.loadExport.mockReset().mockResolvedValue([])
})

describe("Reservas export boundary", () => {
  it("requires a real team session before reading messages", async () => {
    mocks.requireMember.mockRejectedValue(new AuthorizationError("No autorizado", 401))
    const response = await GET(new NextRequest("http://localhost/api/reservas-prospectos/export"))
    expect(response.status).toBe(401)
    expect(mocks.loadExport).not.toHaveBeenCalled()
  })
  it("exports a labeled JSON file with a scope and no caching", async () => {
    const response = await GET(new NextRequest("http://localhost/api/reservas-prospectos/export"))
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.get("content-disposition")).toContain("completo.json")
    expect(await response.json()).toMatchObject({ scope: "operon_reservas", prospect_count: 0, prospects: [], filtered: false })
  })
  it("returns a downloadable CSV for the requested dataset", async () => {
    const response = await GET(new NextRequest("http://localhost/api/reservas-prospectos/export?format=csv&dataset=eventos"))
    expect(response.headers.get("content-type")).toContain("text/csv")
    expect(await response.text()).toContain('"id_evento_fuente"')
  })
  it("rejects invalid formats and returns an error rather than a partial file", async () => {
    expect((await GET(new NextRequest("http://localhost/api/reservas-prospectos/export?format=xlsx"))).status).toBe(400)
    mocks.loadExport.mockRejectedValue(new Error("synthetic database failure"))
    const response = await GET(new NextRequest("http://localhost/api/reservas-prospectos/export"))
    expect(response.status).toBe(503)
    expect(response.headers.get("content-disposition")).toBeNull()
    mocks.loadExport.mockRejectedValue(new ReservasExportLimitError("Límite de 5000"))
    expect((await GET(new NextRequest("http://localhost/api/reservas-prospectos/export"))).status).toBe(413)
  })
})
