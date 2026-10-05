import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ReservasPanel, ReservasSalesRow } from "@/lib/reservas-sales"
import Page from "./page"

const mocks = vi.hoisted(() => ({ requireMember: vi.fn(), loadPanel: vi.fn() }))
vi.mock("@/lib/auth", () => ({ requireMember: mocks.requireMember, AuthorizationError: class extends Error {} }))
vi.mock("@/lib/reservas-sales-server", () => ({ loadReservasPanel: mocks.loadPanel }))
vi.mock("@/components/shell/page-transition", () => ({ PageTransition: ({ children }: { children: React.ReactNode }) => children }))
vi.mock("@/app/(app)/reservas-prospectos/actions", () => ({ recordReservasMilestone: vi.fn() }))
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a> }))

const fixtureRow: ReservasSalesRow = {
  id: "a0000000-0000-0000-0000-000000000001", lead_id: "a0000000-0000-0000-0000-000000000002",
  sheet_id: "synthetic", sheet_lead_id: "row-1", sheet_url: "https://docs.google.com/spreadsheets/d/synthetic/edit",
  phone_e164: "+5491112345678", organization_name: "Alojamiento sintético · QA", owner_name: "Santiago",
  do_not_contact: false, suppression_reason: null, created_at: "2026-10-01T16:00:00Z",
  conversation_id: "a0000000-0000-0000-0000-000000000003", stage: "meeting_scheduled",
  first_outbound_at: "2026-10-01T18:00:00Z", last_outbound_at: "2026-10-03T18:00:00Z",
  last_inbound_at: "2026-10-04T18:00:00Z", last_contact_at: "2026-10-04T18:00:00Z",
  responded: true, meeting_scheduled: true, meeting_held: false, proposal_sent: false,
  ever_won: false, ever_lost: false, scheduled_at: "2026-10-04T18:00:00Z",
  held_at: null, proposal_at: null, won_at: null, lost_at: null,
  meeting_at: "2026-10-05T20:00:00Z", next_action: "Confirmar quién participa de la reunión",
  next_action_date: "2026-10-03", pending_response: true, follow_up_overdue: true, meeting_soon: true,
}
const fixture: ReservasPanel = {
  rows: [fixtureRow, { ...fixtureRow, id: "b0000000-0000-0000-0000-000000000001", organization_name: "Hospedaje de prueba",
    stage: "proposal_sent", pending_response: false, follow_up_overdue: false, meeting_soon: false,
    conversation_id: null, proposal_sent: true, next_action: null, next_action_date: null, meeting_at: null },
  { ...fixtureRow, id: "c0000000-0000-0000-0000-000000000001", organization_name: "Posada sintética",
    stage: "contacted", do_not_contact: true, suppression_reason: "Solicitud de baja sintética",
    pending_response: false, follow_up_overdue: false, meeting_soon: false }],
  metrics: { imported: 3, contacted: 3, responded: 2, scheduled: 1, held: 0, proposed: 1, won: 0,
    lost: 0, suppressed: 1, scheduled_from_replies: 1, held_from_scheduled: 0, proposed_from_held: 0,
    won_from_proposed: 0, pending: 1, overdue: 1, meeting_soon: 1 },
  generated_at: "2026-10-04T20:00:00Z", page: 1, page_size: 50, filtered_count: 3,
}

beforeEach(() => {
  mocks.requireMember.mockResolvedValue({ supabase: {} })
  mocks.loadPanel.mockResolvedValue(fixture)
})

describe("Reservas panel presentation", () => {
  it("renders the real page with explicit denominators, suppression and chat links", async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain("sobre quienes respondieron")
    expect(html).toContain("No contactar")
    expect(html).toContain("conversation=a0000000-0000-0000-0000-000000000003")
    expect(html).toContain("Sin próximo paso definido")
    expect(html).toContain("JSON completo")
    const qaDir = process.env.RESERVAS_QA_DIR
    if (qaDir) {
      await mkdir(qaDir, { recursive: true })
      await writeFile(path.join(qaDir, "panel-synthetic.html"), `<!doctype html><html lang="es-AR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><link rel="stylesheet" href="/panel.css"><style>body{--font-geist-sans:Arial,sans-serif;--font-space-grotesk:Arial,sans-serif;--font-jetbrains-mono:monospace}</style></head><body><p style="padding:8px 24px;background:#eee;font-size:12px">QA local · todos los datos son sintéticos · render del componente real</p>${html}</body></html>`, "utf8")
    }
  })
  it("shows an honest empty state without manufactured conversion rates", async () => {
    mocks.loadPanel.mockResolvedValue({ ...fixture, rows: [], filtered_count: 0,
      metrics: Object.fromEntries(Object.keys(fixture.metrics).map(key => [key, 0])) })
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain("Todavía no hay alojamientos")
    expect(html).not.toContain("Recorrido comercial")
  })
  it("does not present a database failure as an empty or successful dataset", async () => {
    mocks.loadPanel.mockRejectedValue(new Error("synthetic read failure"))
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain("No pudimos cargar la prospección")
    expect(html).not.toContain("Todavía no hay alojamientos")
    expect(html).not.toContain("Recorrido comercial")
  })
})
