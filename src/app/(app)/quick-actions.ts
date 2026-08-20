"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import {
  PROJECT_AREAS,
  PROJECT_TASK_TEMPLATES,
  type ProjectArea,
  type ProjectEngagement,
} from "@/lib/constants"
import type { ActionResult } from "@/lib/action-result"
import type { Enums } from "@/lib/supabase/types"

/** Altas rápidas desde el panel. Las tareas y los leads reutilizan las
 *  acciones que ya existen en `proyectos/actions.ts` y `leads/actions.ts`. */

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim()
}

/**
 * Proyecto sin pasar por una oportunidad ganada (ese camino sigue en
 * `winOpportunity`). Arranca en discovery con el checklist del tipo elegido.
 */
export async function createProject(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  const supabase = await createClient()

  const name = str(fd, "name")
  const type = str(fd, "type") as Enums<"service_type">
  const area = str(fd, "area") as ProjectArea
  const engagementKind = str(fd, "engagement_kind") as ProjectEngagement
  if (!name) return { error: "El nombre del proyecto es obligatorio." }
  if (!type) return { error: "Elegí el tipo de servicio." }
  if (!PROJECT_AREAS.includes(area)) return { error: "Elegí un área de Operon." }
  if (engagementKind !== "client" && engagementKind !== "internal") {
    return { error: "Elegí si el proyecto es interno o para un cliente." }
  }

  const clientId = str(fd, "client_id")
  if (engagementKind === "client" && !clientId) {
    return { error: "Los proyectos para clientes necesitan un cliente." }
  }
  const ownerId = str(fd, "owner_id")
  const dueDate = str(fd, "due_date")
  const operationalType = str(fd, "operational_type")

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      name,
      type,
      area,
      engagement_kind: engagementKind,
      operational_type: operationalType || null,
      status: "discovery",
      client_id: engagementKind === "client" ? clientId : null,
      ...(ownerId ? { owner_id: ownerId } : {}),
      ...(dueDate ? { due_date: dueDate } : {}),
    })
    .select("id")
    .single()

  if (error || !project) {
    return { error: error?.message ?? "No se pudo crear el proyecto." }
  }

  const template = PROJECT_TASK_TEMPLATES[type] ?? []
  if (template.length > 0) {
    const { error: tasksError } = await supabase.from("project_tasks").insert(
      template.map((t, i) => ({
        project_id: project.id,
        title: t.title,
        priority: t.priority,
        position: i + 1,
      }))
    )
    // El proyecto ya existe: avisamos del checklist sin perder el alta.
    if (tasksError) {
      revalidatePath("/")
      revalidatePath("/proyectos")
      return { error: `Proyecto creado, pero falló el checklist: ${tasksError.message}` }
    }
  }

  revalidatePath("/")
  revalidatePath("/proyectos")
  if (clientId) revalidatePath(`/clientes/${clientId}`)
  return { ok: true }
}

/** Convierte una organización existente en cliente activo. */
export async function createClientRecord(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  const supabase = await createClient()

  const organizationId = str(fd, "organization_id")
  if (!organizationId) return { error: "Elegí una organización." }

  const ownerId = str(fd, "owner_id")
  const notes = str(fd, "notes")

  const { data: existing } = await supabase
    .from("clients")
    .select("id")
    .eq("organization_id", organizationId)
    .limit(1)
    .maybeSingle()

  if (existing) {
    return { error: "Esa organización ya figura como cliente." }
  }

  const { error } = await supabase.from("clients").insert({
    organization_id: organizationId,
    status: "activo",
    ...(ownerId ? { owner_id: ownerId } : {}),
    ...(notes ? { notes } : {}),
  })
  if (error) return { error: error.message }

  revalidatePath("/")
  revalidatePath("/clientes")
  return { ok: true }
}

/**
 * Actividad de agenda. Puede colgar de una oportunidad, de un proyecto o de
 * nada (una reunión suelta también es parte del día).
 */
export async function createActivity(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  const supabase = await createClient()

  const body = str(fd, "body")
  if (!body) return { error: "Escribí de qué se trata." }

  const type = (str(fd, "type") || "reunion") as Enums<"activity_type">
  const dueDate = str(fd, "due_date")
  const opportunityId = str(fd, "opportunity_id")
  const projectId = str(fd, "project_id")
  const ownerId = str(fd, "owner_id")

  const { error } = await supabase.from("activities").insert({
    type,
    body,
    ...(dueDate ? { due_date: dueDate } : {}),
    ...(opportunityId ? { opportunity_id: opportunityId } : {}),
    ...(projectId ? { project_id: projectId } : {}),
    ...(ownerId ? { owner_id: ownerId } : {}),
  })
  if (error) return { error: error.message }

  revalidatePath("/")
  if (opportunityId) revalidatePath(`/oportunidades/${opportunityId}`)
  if (projectId) revalidatePath(`/proyectos/${projectId}`)
  return { ok: true }
}

export async function completeActivity(
  activityId: string
): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("activities")
    .update({ completed: true, completed_at: new Date().toISOString() })
    .eq("id", activityId)
  if (error) return { error: error.message }

  revalidatePath("/")
  revalidatePath("/oportunidades")
  revalidatePath("/proyectos")
  return { ok: true }
}
