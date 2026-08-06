"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { normalizeDomain, normalizeEmail } from "@/lib/dedupe"
import { parseCSV, normalizeHeader } from "@/lib/csv"
import { LEAD_SOURCE_LABELS, SERVICE_TYPE_LABELS } from "@/lib/constants"
import type { Enums } from "@/lib/supabase/types"

export type Duplicate = {
  kind: "organization" | "contact" | "lead"
  label: string
  detail: string
}

export type LeadFormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "duplicates"; duplicates: Duplicate[] }

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim()
}

/** Crea un lead. Si detecta duplicados y no viene `force`, los devuelve para advertir. */
export async function createLead(
  _prev: LeadFormState,
  fd: FormData
): Promise<LeadFormState> {
  const supabase = await createClient()

  const orgName = str(fd, "org_name")
  const orgDomain = normalizeDomain(str(fd, "org_domain") || str(fd, "org_website"))
  const orgWebsite = str(fd, "org_website")
  const contactName = str(fd, "contact_name")
  const contactEmail = normalizeEmail(str(fd, "contact_email"))
  const contactPhone = str(fd, "contact_phone")
  const source = (str(fd, "source") || "lista_manual") as Enums<"lead_source">
  const serviceInterest = str(fd, "service_interest")
  const ownerId = str(fd, "owner_id")
  const segment = str(fd, "segment")
  const notes = str(fd, "notes")
  const force = fd.get("force") === "true"

  if (!orgName) {
    return { status: "error", message: "El nombre de la empresa es obligatorio." }
  }

  // ---------- Dedupe visible ----------
  if (!force) {
    const duplicates: Duplicate[] = []

    if (orgDomain) {
      const { data: orgs } = await supabase
        .from("organizations")
        .select("id, name, domain")
        .eq("domain", orgDomain)
        .limit(3)
      for (const o of orgs ?? []) {
        duplicates.push({
          kind: "organization",
          label: o.name,
          detail: `Mismo dominio: ${o.domain}`,
        })
      }
    }

    if (contactEmail) {
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, full_name, email")
        .ilike("email", contactEmail)
        .limit(3)
      for (const c of contacts ?? []) {
        duplicates.push({
          kind: "contact",
          label: c.full_name,
          detail: `Mismo email: ${c.email}`,
        })
      }
    }

    if (duplicates.length > 0) {
      return { status: "duplicates", duplicates }
    }
  }

  // ---------- Resolver organización (reusar por dominio) ----------
  let organizationId: string | null = null
  if (orgDomain) {
    const { data: existing } = await supabase
      .from("organizations")
      .select("id")
      .eq("domain", orgDomain)
      .limit(1)
      .maybeSingle()
    organizationId = existing?.id ?? null
  }
  if (!organizationId) {
    const { data: newOrg, error } = await supabase
      .from("organizations")
      .insert({
        name: orgName,
        domain: orgDomain,
        website: orgWebsite || null,
      })
      .select("id")
      .single()
    if (error) return { status: "error", message: error.message }
    organizationId = newOrg.id
  }

  // ---------- Resolver contacto ----------
  let contactId: string | null = null
  if (contactName || contactEmail) {
    if (contactEmail) {
      const { data: existing } = await supabase
        .from("contacts")
        .select("id")
        .ilike("email", contactEmail)
        .limit(1)
        .maybeSingle()
      contactId = existing?.id ?? null
    }
    if (!contactId) {
      const { data: newContact, error } = await supabase
        .from("contacts")
        .insert({
          organization_id: organizationId,
          full_name: contactName || contactEmail || "Sin nombre",
          email: contactEmail,
          phone: contactPhone || null,
        })
        .select("id")
        .single()
      if (error) return { status: "error", message: error.message }
      contactId = newContact.id
    }
  }

  // ---------- Crear lead ----------
  const { error: leadError } = await supabase.from("leads").insert({
    organization_id: organizationId,
    contact_id: contactId,
    source,
    service_interest: (serviceInterest || null) as Enums<"service_type"> | null,
    owner_id: ownerId || null,
    segment: segment || null,
    notes: notes || null,
  })
  if (leadError) return { status: "error", message: leadError.message }

  revalidatePath("/leads")
  redirect("/leads")
}

/** Cambia el estado de calificación de un lead. */
export async function updateLeadStatus(
  leadId: string,
  status: Enums<"lead_status">
) {
  const supabase = await createClient()
  await supabase.from("leads").update({ status }).eq("id", leadId)
  revalidatePath("/leads")
  revalidatePath(`/leads/${leadId}`)
}

/** Convierte un lead en oportunidad (crea oportunidad + marca lead convertido). */
export async function convertLeadToOpportunity(_prev: unknown, fd: FormData) {
  const supabase = await createClient()

  const leadId = str(fd, "lead_id")
  const title = str(fd, "title")
  const estimatedValue = str(fd, "estimated_value")
  const nextAction = str(fd, "next_action")
  const nextActionDate = str(fd, "next_action_date")

  if (!leadId) return { error: "Falta el lead." }
  if (!title) return { error: "El título de la oportunidad es obligatorio." }
  if (!nextAction || !nextActionDate) {
    return { error: "Toda oportunidad activa necesita una próxima acción con fecha." }
  }

  const { data: lead } = await supabase
    .from("leads")
    .select("id, organization_id, contact_id, service_interest, owner_id")
    .eq("id", leadId)
    .single()

  if (!lead) return { error: "Lead no encontrado." }

  const { data: opp, error } = await supabase
    .from("opportunities")
    .insert({
      lead_id: lead.id,
      organization_id: lead.organization_id,
      contact_id: lead.contact_id,
      title,
      stage: "nuevo",
      service_type: lead.service_interest,
      estimated_value: estimatedValue ? Number(estimatedValue) : null,
      next_action: nextAction,
      next_action_date: nextActionDate,
      owner_id: lead.owner_id,
    })
    .select("id")
    .single()

  if (error) return { error: error.message }

  await supabase.from("leads").update({ status: "convertido" }).eq("id", leadId)

  revalidatePath("/leads")
  revalidatePath("/oportunidades")
  redirect(`/oportunidades/${opp.id}`)
}

// ---------- Importación CSV ----------
function resolveSource(raw: string): Enums<"lead_source"> {
  const s = raw.trim().toLowerCase()
  const keys = Object.keys(LEAD_SOURCE_LABELS) as Enums<"lead_source">[]
  const byKey = keys.find((k) => k === s)
  if (byKey) return byKey
  const byLabel = keys.find(
    (k) => LEAD_SOURCE_LABELS[k].toLowerCase() === s
  )
  return byLabel ?? "lista_manual"
}

function resolveService(raw: string): Enums<"service_type"> | null {
  const s = raw.trim().toLowerCase()
  if (!s) return null
  const keys = Object.keys(SERVICE_TYPE_LABELS) as Enums<"service_type">[]
  return (
    keys.find((k) => k === s) ??
    keys.find((k) => SERVICE_TYPE_LABELS[k].toLowerCase() === s) ??
    null
  )
}

export type ImportState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; created: number; skipped: number; errors: string[] }

/**
 * Importa leads desde un CSV pegado. Salta filas cuyo dominio o email
 * ya existen (dedupe) y reporta un resumen. Nunca fusiona.
 */
export async function importLeads(
  _prev: ImportState,
  fd: FormData
): Promise<ImportState> {
  const supabase = await createClient()
  const csv = String(fd.get("csv") ?? "").trim()
  const ownerId = str(fd, "owner_id")

  if (!csv) return { status: "error", message: "Pegá el contenido CSV." }

  const rows = parseCSV(csv)
  if (rows.length < 2) {
    return {
      status: "error",
      message: "El CSV necesita una fila de encabezados y al menos una fila de datos.",
    }
  }

  const headers = rows[0].map(normalizeHeader)
  const idx = (key: string) => headers.indexOf(key)
  const iEmpresa = idx("empresa")
  if (iEmpresa === -1) {
    return {
      status: "error",
      message: "Falta la columna 'empresa' en el encabezado.",
    }
  }

  let created = 0
  let skipped = 0
  const errors: string[] = []

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]
    const get = (key: string) => {
      const i = idx(key)
      return i >= 0 ? (cells[i] ?? "").trim() : ""
    }

    const empresa = (cells[iEmpresa] ?? "").trim()
    if (!empresa) continue

    const domain = normalizeDomain(get("web"))
    const email = normalizeEmail(get("email"))

    // Dedupe: saltar si ya existe org (por dominio) o contacto (por email).
    if (domain) {
      const { data } = await supabase
        .from("organizations")
        .select("id")
        .eq("domain", domain)
        .limit(1)
        .maybeSingle()
      if (data) {
        skipped++
        continue
      }
    }
    if (email) {
      const { data } = await supabase
        .from("contacts")
        .select("id")
        .ilike("email", email)
        .limit(1)
        .maybeSingle()
      if (data) {
        skipped++
        continue
      }
    }

    // Crear org
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .insert({ name: empresa, domain, website: get("web") || null })
      .select("id")
      .single()
    if (orgErr || !org) {
      errors.push(`Fila ${r + 1} (${empresa}): ${orgErr?.message ?? "error"}`)
      continue
    }

    // Crear contacto (opcional)
    let contactId: string | null = null
    const contacto = get("contacto")
    if (contacto || email) {
      const { data: c } = await supabase
        .from("contacts")
        .insert({
          organization_id: org.id,
          full_name: contacto || email || "Sin nombre",
          email,
          phone: get("telefono") || null,
        })
        .select("id")
        .single()
      contactId = c?.id ?? null
    }

    // Crear lead
    const { error: leadErr } = await supabase.from("leads").insert({
      organization_id: org.id,
      contact_id: contactId,
      source: resolveSource(get("fuente")),
      service_interest: resolveService(get("servicio")),
      segment: get("segmento") || null,
      owner_id: ownerId || null,
    })
    if (leadErr) {
      errors.push(`Fila ${r + 1} (${empresa}): ${leadErr.message}`)
      continue
    }
    created++
  }

  revalidatePath("/leads")
  return { status: "done", created, skipped, errors }
}
