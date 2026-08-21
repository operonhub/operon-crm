"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { writeAudit } from "@/lib/audit"
import type { ActionResult } from "@/lib/action-result"
import { authorizationMessage, requireMember } from "@/lib/auth"
import { isActiveStage } from "@/lib/constants"
import type { Enums, TablesUpdate } from "@/lib/supabase/types"

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim()
}

export type MoveResult =
  | { ok: true }
  | { ok: false; needsNextAction: true }
  | { ok: false; error: string }

export type OpportunityFormState =
  | { status: "idle" }
  | { status: "error"; message: string }

export async function createOpportunity(
  _prev: OpportunityFormState,
  fd: FormData
): Promise<OpportunityFormState> {
  let opportunityId: string | null = null
  try {
    const { supabase, profile } = await requireMember()
    const title = str(fd, "title")
    const organizationName = str(fd, "organization_name")
    const existingOrganizationId = str(fd, "organization_id")
    const serviceType = str(fd, "service_type")
    const currency = str(fd, "currency") || "USD"
    const estimatedValueRaw = str(fd, "estimated_value")
    const nextAction = str(fd, "next_action")
    const nextActionDate = str(fd, "next_action_date")
    const ownerId = str(fd, "owner_id") || profile.id

    if (!title) {
      return { status: "error", message: "El nombre de la oportunidad es obligatorio." }
    }
    if (!nextAction || !nextActionDate) {
      return { status: "error", message: "Definí la próxima acción y su fecha." }
    }
    if (currency !== "ARS" && currency !== "USD") {
      return { status: "error", message: "Elegí ARS o USD." }
    }
    let estimatedValue: number | null = null
    if (estimatedValueRaw) {
      estimatedValue = Number(estimatedValueRaw)
      if (!Number.isFinite(estimatedValue) || estimatedValue < 0) {
        return { status: "error", message: "Ingresá un valor estimado válido." }
      }
    }

    let organizationId: string | null = existingOrganizationId || null
    if (!organizationId && organizationName) {
      const { data: existing } = await supabase
        .from("organizations")
        .select("id")
        .ilike("name", organizationName)
        .limit(1)
        .maybeSingle()
      if (existing) {
        organizationId = existing.id
      } else {
        const { data: organization, error: organizationError } = await supabase
          .from("organizations")
          .insert({ name: organizationName })
          .select("id")
          .single()
        if (organizationError || !organization) {
          return {
            status: "error",
            message: organizationError?.message ?? "No se pudo crear la empresa.",
          }
        }
        organizationId = organization.id
      }
    }

    const { data: opportunity, error } = await supabase
      .from("opportunities")
      .insert({
        title,
        organization_id: organizationId,
        service_type: (serviceType || null) as Enums<"service_type"> | null,
        estimated_value: estimatedValue,
        currency,
        next_action: nextAction,
        next_action_date: nextActionDate,
        owner_id: ownerId,
        stage: "nuevo",
      })
      .select("id")
      .single()
    if (error || !opportunity) {
      return {
        status: "error",
        message: error?.message ?? "No se pudo crear la oportunidad.",
      }
    }
    opportunityId = opportunity.id
    await writeAudit(supabase, profile.id, "opportunity", opportunity.id, "created")
    revalidatePath("/oportunidades")
    revalidatePath("/")
  } catch (error) {
    return { status: "error", message: authorizationMessage(error) }
  }
  if (opportunityId) redirect(`/oportunidades/${opportunityId}`)
  return { status: "error", message: "No se pudo abrir la oportunidad." }
}

export async function moveStage(
  id: string,
  stage: Enums<"opportunity_stage">,
  nextAction?: string,
  nextActionDate?: string,
  lostReason?: string
): Promise<MoveResult> {
  try {
    const { supabase, profile } = await requireMember()
    const { data: opportunity, error: readError } = await supabase
      .from("opportunities")
      .select("next_action, next_action_date")
      .eq("id", id)
      .single()
    if (readError || !opportunity) {
      return { ok: false, error: "Oportunidad no encontrada." }
    }
    const action = nextAction?.trim() || opportunity.next_action?.trim()
    const actionDate = nextActionDate || opportunity.next_action_date
    if (isActiveStage(stage) && (!action || !actionDate)) {
      return { ok: false, needsNextAction: true }
    }
    if (stage === "perdido" && !lostReason?.trim()) {
      return { ok: false, error: "Indicá por qué se perdió la oportunidad." }
    }

    const patch: TablesUpdate<"opportunities"> = { stage }
    if (nextAction !== undefined) patch.next_action = nextAction.trim() || null
    if (nextActionDate !== undefined) patch.next_action_date = nextActionDate || null
    if (stage === "perdido") patch.lost_reason = lostReason?.trim() || null
    const { error } = await supabase.from("opportunities").update(patch).eq("id", id)
    if (error) return { ok: false, error: error.message }
    await writeAudit(supabase, profile.id, "opportunity", id, `stage_${stage}`)
    revalidatePath("/oportunidades")
    revalidatePath(`/oportunidades/${id}`)
    revalidatePath("/")
    return { ok: true }
  } catch (error) {
    return { ok: false, error: authorizationMessage(error) }
  }
}

export async function updateOpportunity(_prev: unknown, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
    const id = str(fd, "opportunity_id")
    if (!id) return { error: "Falta la oportunidad." }
    const nextAction = str(fd, "next_action")
    const nextActionDate = str(fd, "next_action_date")
    const estimatedValue = str(fd, "estimated_value")
    const probability = str(fd, "probability")
    const expectedClose = str(fd, "expected_close_date")
    const stage = str(fd, "stage") as Enums<"opportunity_stage"> | ""

    if (stage && isActiveStage(stage) && (!nextAction || !nextActionDate)) {
      return { error: "Las oportunidades activas necesitan próxima acción y fecha." }
    }
    const parsedValue = estimatedValue ? Number(estimatedValue) : null
    const parsedProbability = probability ? Number(probability) : null
    if (parsedValue !== null && (!Number.isFinite(parsedValue) || parsedValue < 0)) {
      return { error: "Ingresá un valor estimado válido." }
    }
    if (
      parsedProbability !== null &&
      (!Number.isInteger(parsedProbability) ||
        parsedProbability < 0 ||
        parsedProbability > 100)
    ) {
      return { error: "La probabilidad debe estar entre 0 y 100." }
    }

    const patch: TablesUpdate<"opportunities"> = {
      title: str(fd, "title") || undefined,
      organization_id: str(fd, "organization_id") || undefined,
      contact_id: str(fd, "contact_id") || null,
      service_type:
        (str(fd, "service_type") as Enums<"service_type">) || null,
      owner_id: str(fd, "owner_id") || null,
      currency: str(fd, "currency") || "USD",
      next_action: nextAction || null,
      next_action_date: nextActionDate || null,
      estimated_value: parsedValue,
      probability: parsedProbability,
      expected_close_date: expectedClose || null,
      ...(stage ? { stage } : {}),
    }
    const { error } = await supabase.from("opportunities").update(patch).eq("id", id)
    if (error) return { error: error.message }
    await writeAudit(supabase, profile.id, "opportunity", id, "updated")
    revalidatePath(`/oportunidades/${id}`)
    revalidatePath("/oportunidades")
    revalidatePath("/")
    revalidatePath("/metricas")
    return { ok: true, message: "Oportunidad actualizada." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function addActivity(_prev: unknown, fd: FormData) {
  try {
    const { supabase, profile } = await requireMember()
    const opportunityId = str(fd, "opportunity_id")
    const type = (str(fd, "type") || "nota") as Enums<"activity_type">
    const body = str(fd, "body")
    const dueDate = str(fd, "due_date")
    if (!opportunityId) return { error: "Falta la oportunidad." }
    if (!body) return { error: "Escribí algo." }

    const { data: opportunity } = await supabase
      .from("opportunities")
      .select("contact_id, owner_id")
      .eq("id", opportunityId)
      .single()
    const { data: activity, error } = await supabase
      .from("activities")
      .insert({
        opportunity_id: opportunityId,
        contact_id: opportunity?.contact_id ?? null,
        owner_id: opportunity?.owner_id ?? profile.id,
        type,
        body,
        due_date: dueDate || null,
      })
      .select("id")
      .single()
    if (error || !activity) {
      return { error: error?.message ?? "No se pudo registrar la actividad." }
    }
    await writeAudit(supabase, profile.id, "activity", activity.id, "created")
    revalidatePath(`/oportunidades/${opportunityId}`)
    revalidatePath("/")
    return { ok: true, message: "Actividad registrada." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function toggleActivity(
  id: string,
  completed: boolean,
  opportunityId: string
) {
  try {
    const { supabase, profile } = await requireMember()
    const { error } = await supabase
      .from("activities")
      .update({
        completed,
        completed_at: completed ? new Date().toISOString() : null,
      })
      .eq("id", id)
    if (error) return { error: error.message }
    await writeAudit(supabase, profile.id, "activity", id, completed ? "completed" : "reopened")
    revalidatePath(`/oportunidades/${opportunityId}`)
    revalidatePath("/")
    return { ok: true }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}
