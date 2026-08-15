"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
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

/** Crea una oportunidad manualmente desde el Pipeline. */
export async function createOpportunity(
  _prev: OpportunityFormState,
  fd: FormData
): Promise<OpportunityFormState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      status: "error",
      message: "Tu sesión venció. Volvé a iniciar sesión.",
    }
  }

  const title = str(fd, "title")
  const organizationName = str(fd, "organization_name")
  const serviceType = str(fd, "service_type")
  const estimatedValueRaw = str(fd, "estimated_value")
  const nextAction = str(fd, "next_action")
  const nextActionDate = str(fd, "next_action_date")
  const ownerId = str(fd, "owner_id")

  if (!title) {
    return { status: "error", message: "El nombre del proyecto es obligatorio." }
  }
  if (!nextAction || !nextActionDate) {
    return {
      status: "error",
      message: "Definí la próxima acción y su fecha.",
    }
  }

  let estimatedValue: number | null = null
  if (estimatedValueRaw) {
    estimatedValue = Number(estimatedValueRaw)
    if (!Number.isFinite(estimatedValue) || estimatedValue < 0) {
      return { status: "error", message: "Ingresá un valor estimado válido." }
    }
  }

  let organizationId: string | null = null
  if (organizationName) {
    const { data: organization, error: organizationError } = await supabase
      .from("organizations")
      .insert({ name: organizationName })
      .select("id")
      .single()

    if (organizationError || !organization) {
      console.error("[pipeline:create-opportunity] organization insert failed", {
        code: organizationError?.code,
        message: organizationError?.message,
      })
      return {
        status: "error",
        message: organizationError?.message ?? "No se pudo crear la empresa.",
      }
    }
    organizationId = organization.id
  }

  const { data: opportunity, error } = await supabase
    .from("opportunities")
    .insert({
      title,
      organization_id: organizationId,
      service_type: (serviceType || null) as Enums<"service_type"> | null,
      estimated_value: estimatedValue,
      next_action: nextAction,
      next_action_date: nextActionDate,
      owner_id: ownerId || null,
      stage: "nuevo",
    })
    .select("id")
    .single()

  if (error || !opportunity) {
    console.error("[pipeline:create-opportunity] opportunity insert failed", {
      code: error?.code,
      message: error?.message,
    })
    return {
      status: "error",
      message: error?.message ?? "No se pudo crear el proyecto.",
    }
  }

  revalidatePath("/oportunidades")
  revalidatePath("/")
  redirect(`/oportunidades/${opportunity.id}`)
}

/**
 * Mueve una oportunidad de etapa.
 * Regla: al pasar a una etapa ACTIVA sin próxima acción, se exige una.
 * El cliente entonces abre un diálogo y reintenta con next_action + fecha.
 */
export async function moveStage(
  id: string,
  stage: Enums<"opportunity_stage">,
  nextAction?: string,
  nextActionDate?: string,
  lostReason?: string
): Promise<MoveResult> {
  const supabase = await createClient()

  const { data: opp } = await supabase
    .from("opportunities")
    .select("next_action_date")
    .eq("id", id)
    .single()

  const willHaveNextAction = nextActionDate || opp?.next_action_date

  if (isActiveStage(stage) && !willHaveNextAction) {
    return { ok: false, needsNextAction: true }
  }

  const patch: TablesUpdate<"opportunities"> = { stage }
  if (nextAction) patch.next_action = nextAction
  if (nextActionDate) patch.next_action_date = nextActionDate
  if (stage === "perdido" && lostReason) patch.lost_reason = lostReason

  const { error } = await supabase
    .from("opportunities")
    .update(patch)
    .eq("id", id)

  if (error) return { ok: false, error: error.message }

  revalidatePath("/oportunidades")
  revalidatePath(`/oportunidades/${id}`)
  revalidatePath("/")
  return { ok: true }
}

/** Actualiza campos de la oportunidad (próxima acción, valor, etc.). */
export async function updateOpportunity(_prev: unknown, fd: FormData) {
  const supabase = await createClient()

  const id = str(fd, "opportunity_id")
  if (!id) return { error: "Falta la oportunidad." }

  const patch: TablesUpdate<"opportunities"> = {}
  const nextAction = str(fd, "next_action")
  const nextActionDate = str(fd, "next_action_date")
  const estimatedValue = str(fd, "estimated_value")
  const probability = str(fd, "probability")
  const expectedClose = str(fd, "expected_close_date")

  patch.next_action = nextAction || null
  patch.next_action_date = nextActionDate || null
  patch.estimated_value = estimatedValue ? Number(estimatedValue) : null
  patch.probability = probability ? Number(probability) : null
  patch.expected_close_date = expectedClose || null

  const { error } = await supabase
    .from("opportunities")
    .update(patch)
    .eq("id", id)
  if (error) return { error: error.message }

  revalidatePath(`/oportunidades/${id}`)
  revalidatePath("/oportunidades")
  revalidatePath("/")
  return { ok: true }
}

/** Agrega una actividad (nota, llamada, email, reunión o tarea). */
export async function addActivity(_prev: unknown, fd: FormData) {
  const supabase = await createClient()

  const opportunityId = str(fd, "opportunity_id")
  const type = (str(fd, "type") || "nota") as Enums<"activity_type">
  const body = str(fd, "body")
  const dueDate = str(fd, "due_date")

  if (!opportunityId) return { error: "Falta la oportunidad." }
  if (!body) return { error: "Escribí algo." }

  // Traemos el contacto de la oportunidad para asociarlo a la actividad.
  const { data: opp } = await supabase
    .from("opportunities")
    .select("contact_id, owner_id")
    .eq("id", opportunityId)
    .single()

  const { error } = await supabase.from("activities").insert({
    opportunity_id: opportunityId,
    contact_id: opp?.contact_id ?? null,
    owner_id: opp?.owner_id ?? null,
    type,
    body,
    due_date: dueDate || null,
  })

  if (error) return { error: error.message }

  revalidatePath(`/oportunidades/${opportunityId}`)
  revalidatePath("/")
  return { ok: true }
}

/** Marca una actividad/tarea como completada o pendiente. */
export async function toggleActivity(id: string, completed: boolean, oppId: string) {
  const supabase = await createClient()
  await supabase
    .from("activities")
    .update({
      completed,
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("id", id)
  revalidatePath(`/oportunidades/${oppId}`)
  revalidatePath("/")
}
