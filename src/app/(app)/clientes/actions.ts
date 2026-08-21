"use server"

import { revalidatePath } from "next/cache"
import type { ActionResult } from "@/lib/action-result"
import { writeAudit } from "@/lib/audit"
import {
  authorizationMessage,
  requireAdmin,
  requireMember,
} from "@/lib/auth"
import { normalizeDomain, normalizeOrganizationName } from "@/lib/dedupe"
import type { Enums } from "@/lib/supabase/types"

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim()
}

export async function createClient(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult<{ clientId: string }>> {
  try {
    const { supabase, profile } = await requireMember()
    const existingOrganizationId = str(fd, "organization_id")
    const organizationName = str(fd, "organization_name")
    const website = str(fd, "website")
    const domain = normalizeDomain(website || str(fd, "domain"))
    const duplicateConfirmed = fd.get("duplicate_confirmed") === "on"

    let organizationId = existingOrganizationId
    if (!organizationId) {
      if (!organizationName) return { error: "Escribí el nombre de la empresa." }
      const [{ data: sameName }, { data: sameDomain }] = await Promise.all([
        supabase
          .from("organizations")
          .select("id, name, domain")
          .ilike("name", organizationName)
          .limit(5),
        domain
          ? supabase
              .from("organizations")
              .select("id, name, domain")
              .eq("domain", domain)
              .limit(5)
          : Promise.resolve({ data: [] }),
      ])
      const possible = [...(sameName ?? []), ...(sameDomain ?? [])]
      const normalizedName = normalizeOrganizationName(organizationName)
      const duplicate = possible.find(
        (item) =>
          (domain && item.domain === domain) ||
          normalizeOrganizationName(item.name) === normalizedName
      )
      if (duplicate && !duplicateConfirmed) {
        return {
          error: `Encontramos una empresa parecida: ${duplicate.name}. Elegila o confirmá que querés crear otra.`,
          fieldErrors: { duplicate_confirmed: ["Confirmación requerida"] },
        }
      }

      const { data: organization, error } = await supabase
        .from("organizations")
        .insert({
          name: organizationName,
          website: website || null,
          domain,
          industry: str(fd, "industry") || null,
          country: str(fd, "country") || null,
          city: str(fd, "city") || null,
        })
        .select("id")
        .single()
      if (error || !organization) {
        return { error: error?.message ?? "No se pudo crear la empresa." }
      }
      organizationId = organization.id
    }

    const { data: existingClient } = await supabase
      .from("clients")
      .select("id, archived_at")
      .eq("organization_id", organizationId)
      .limit(1)
      .maybeSingle()
    if (existingClient) {
      return {
        error: existingClient.archived_at
          ? "Esa empresa ya tiene un cliente archivado. Restauralo desde el filtro de archivados."
          : "Esa empresa ya figura como cliente.",
      }
    }

    const { data: client, error } = await supabase
      .from("clients")
      .insert({
        organization_id: organizationId,
        status: "activo",
        owner_id: str(fd, "owner_id") || profile.id,
        notes: str(fd, "notes") || null,
      })
      .select("id")
      .single()
    if (error || !client) return { error: error?.message ?? "No se pudo crear el cliente." }
    await writeAudit(supabase, profile.id, "client", client.id, "created", {
      organization_id: organizationId,
    })
    revalidatePath("/clientes")
    revalidatePath("/")
    return {
      ok: true,
      data: { clientId: client.id },
      message: "Cliente creado.",
    }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function updateClient(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
    const clientId = str(fd, "client_id")
    const organizationId = str(fd, "organization_id")
    if (!clientId || !organizationId) return { error: "Falta el cliente." }
    const status = str(fd, "status") as Enums<"client_status">
    const { error: organizationError } = await supabase
      .from("organizations")
      .update({
        name: str(fd, "name"),
        website: str(fd, "website") || null,
        domain: normalizeDomain(str(fd, "website") || str(fd, "domain")),
        industry: str(fd, "industry") || null,
        size: str(fd, "size") || null,
        country: str(fd, "country") || null,
        city: str(fd, "city") || null,
        linkedin: str(fd, "linkedin") || null,
        notes: str(fd, "organization_notes") || null,
      })
      .eq("id", organizationId)
    if (organizationError) return { error: organizationError.message }

    const { error } = await supabase
      .from("clients")
      .update({
        status,
        owner_id: str(fd, "owner_id") || null,
        notes: str(fd, "notes") || null,
      })
      .eq("id", clientId)
    if (error) return { error: error.message }
    await writeAudit(supabase, profile.id, "client", clientId, "updated")
    revalidatePath("/clientes")
    revalidatePath(`/clientes/${clientId}`)
    revalidatePath("/")
    return { ok: true, message: "Cliente actualizado." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function createContact(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
    const clientId = str(fd, "client_id")
    const organizationId = str(fd, "organization_id")
    const fullName = str(fd, "full_name")
    if (!organizationId || !fullName) return { error: "Escribí el nombre del contacto." }
    const { data, error } = await supabase
      .from("contacts")
      .insert({
        organization_id: organizationId,
        full_name: fullName,
        title: str(fd, "title") || null,
        email: str(fd, "email") || null,
        phone: str(fd, "phone") || null,
        linkedin: str(fd, "linkedin") || null,
        notes: str(fd, "notes") || null,
      })
      .select("id")
      .single()
    if (error || !data) return { error: error?.message ?? "No se pudo crear el contacto." }
    await writeAudit(supabase, profile.id, "contact", data.id, "created")
    revalidatePath(`/clientes/${clientId}`)
    return { ok: true, message: "Contacto agregado." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function updateContact(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
    const clientId = str(fd, "client_id")
    const contactId = str(fd, "contact_id")
    const fullName = str(fd, "full_name")
    if (!contactId || !fullName) return { error: "Falta el contacto." }
    const { error } = await supabase
      .from("contacts")
      .update({
        full_name: fullName,
        title: str(fd, "title") || null,
        email: str(fd, "email") || null,
        phone: str(fd, "phone") || null,
        linkedin: str(fd, "linkedin") || null,
        notes: str(fd, "notes") || null,
      })
      .eq("id", contactId)
    if (error) return { error: error.message }
    await writeAudit(supabase, profile.id, "contact", contactId, "updated")
    revalidatePath(`/clientes/${clientId}`)
    return { ok: true, message: "Contacto actualizado." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function deleteContact(
  contactId: string,
  clientId: string
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
    const { error } = await supabase.from("contacts").delete().eq("id", contactId)
    if (error) return { error: error.message }
    await writeAudit(supabase, profile.id, "contact", contactId, "deleted")
    revalidatePath(`/clientes/${clientId}`)
    return { ok: true }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function archiveClient(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireAdmin()
    const clientId = str(fd, "client_id")
    const reason = str(fd, "reason")
    const restore = fd.get("restore") === "true"
    if (!clientId) return { error: "Falta el cliente." }
    if (!restore && !reason) return { error: "Indicá el motivo del archivado." }
    const { error } = await supabase
      .from("clients")
      .update({
        archived_at: restore ? null : new Date().toISOString(),
        archived_by: restore ? null : profile.id,
        archive_reason: restore ? null : reason,
      })
      .eq("id", clientId)
    if (error) return { error: error.message }
    await writeAudit(supabase, profile.id, "client", clientId, restore ? "restored" : "archived", {
      reason: reason || null,
    })
    revalidatePath("/clientes")
    revalidatePath(`/clientes/${clientId}`)
    revalidatePath("/")
    return { ok: true, message: restore ? "Cliente restaurado." : "Cliente archivado." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}
