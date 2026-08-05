"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { normalizeDomain, normalizeEmail } from "@/lib/dedupe"
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
