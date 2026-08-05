"use server"

import { revalidatePath } from "next/cache"
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
export async function updateOpportunity(id: string, fd: FormData) {
  const supabase = await createClient()

  const patch: TablesUpdate<"opportunities"> = {}
  const nextAction = str(fd, "next_action")
  const nextActionDate = str(fd, "next_action_date")
  const estimatedValue = str(fd, "estimated_value")
  const probability = str(fd, "probability")

  if (nextAction) patch.next_action = nextAction
  if (nextActionDate) patch.next_action_date = nextActionDate
  if (estimatedValue) patch.estimated_value = Number(estimatedValue)
  if (probability) patch.probability = Number(probability)

  await supabase.from("opportunities").update(patch).eq("id", id)
  revalidatePath(`/oportunidades/${id}`)
  revalidatePath("/oportunidades")
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
