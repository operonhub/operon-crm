"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import {
  PROJECT_AREAS,
  PROJECT_TASK_TEMPLATES,
  type ProjectArea,
} from "@/lib/constants"
import type { ActionResult } from "@/lib/action-result"
import type { Enums, TablesUpdate } from "@/lib/supabase/types"

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim()
}

/**
 * Marca una oportunidad como Ganada y crea cliente + proyecto con checklist.
 * Reutiliza el cliente existente de la organización si ya hay uno.
 */
export async function winOpportunity(_prev: unknown, fd: FormData) {
  const supabase = await createClient()

  const opportunityId = str(fd, "opportunity_id")
  const projectName = str(fd, "project_name")
  const projectType = (str(fd, "project_type") ||
    "landing_page") as Enums<"service_type">
  const projectArea = str(fd, "project_area") as ProjectArea
  const operationalType = str(fd, "operational_type")

  if (!opportunityId) return { error: "Falta la oportunidad." }
  if (!projectName) return { error: "El nombre del proyecto es obligatorio." }
  if (!PROJECT_AREAS.includes(projectArea)) {
    return { error: "Elegí un área de Operon para el proyecto." }
  }

  const { data: opp } = await supabase
    .from("opportunities")
    .select("id, organization_id, owner_id")
    .eq("id", opportunityId)
    .single()

  if (!opp) return { error: "Oportunidad no encontrada." }

  // 1) Etapa -> ganado
  await supabase
    .from("opportunities")
    .update({ stage: "ganado" })
    .eq("id", opportunityId)

  // 2) Cliente (reusar si la organización ya es cliente)
  let clientId: string | null = null
  if (opp.organization_id) {
    const { data: existing } = await supabase
      .from("clients")
      .select("id")
      .eq("organization_id", opp.organization_id)
      .limit(1)
      .maybeSingle()
    clientId = existing?.id ?? null
  }
  if (!clientId) {
    const { data: client, error } = await supabase
      .from("clients")
      .insert({
        organization_id: opp.organization_id,
        opportunity_id: opportunityId,
        status: "activo",
        owner_id: opp.owner_id,
      })
      .select("id")
      .single()
    if (error) return { error: error.message }
    clientId = client.id
  }

  // 3) Proyecto
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .insert({
      client_id: clientId,
      opportunity_id: opportunityId,
      name: projectName,
      type: projectType,
      area: projectArea,
      engagement_kind: "client",
      operational_type: operationalType || null,
      status: "discovery",
      owner_id: opp.owner_id,
    })
    .select("id")
    .single()
  if (projErr || !project) {
    return { error: projErr?.message ?? "No se pudo crear el proyecto." }
  }

  // 4) Checklist según tipo
  const template = PROJECT_TASK_TEMPLATES[projectType] ?? []
  if (template.length > 0) {
    await supabase.from("project_tasks").insert(
      template.map((t, i) => ({
        project_id: project.id,
        title: t.title,
        priority: t.priority,
        position: i + 1,
      }))
    )
  }

  revalidatePath("/oportunidades")
  revalidatePath("/proyectos")
  revalidatePath("/clientes")
  redirect(`/proyectos/${project.id}`)
}

export async function updateProjectStatus(
  id: string,
  status: Enums<"project_status">
) {
  const supabase = await createClient()
  await supabase.from("projects").update({ status }).eq("id", id)
  revalidatePath("/proyectos")
  revalidatePath(`/proyectos/${id}`)
}

export async function updateProjectOperationalData(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  const supabase = await createClient()
  const id = str(fd, "project_id")
  const area = str(fd, "area") as ProjectArea
  const engagementKind = str(fd, "engagement_kind")
  const operationalType = str(fd, "operational_type")
  const clientId = str(fd, "client_id")

  if (!id) return { error: "Falta el proyecto." }
  if (!PROJECT_AREAS.includes(area)) return { error: "Elegí un área válida." }
  if (engagementKind !== "internal" && engagementKind !== "client") {
    return { error: "Elegí la modalidad del proyecto." }
  }
  if (engagementKind === "client" && !clientId) {
    return { error: "Elegí el cliente del proyecto." }
  }

  const { error } = await supabase
    .from("projects")
    .update({
      area,
      engagement_kind: engagementKind,
      operational_type: operationalType || null,
      client_id: engagementKind === "client" ? clientId : null,
    })
    .eq("id", id)
  if (error) return { error: error.message }

  revalidatePath("/")
  revalidatePath("/proyectos")
  revalidatePath(`/proyectos/${id}`)
  revalidatePath("/clientes")
  return { ok: true }
}

export async function toggleTask(
  taskId: string,
  status: Enums<"task_status">,
  projectId: string
): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("project_tasks")
    .update({ status })
    .eq("id", taskId)
  if (error) return { error: error.message }

  revalidatePath(`/proyectos/${projectId}`)
  revalidatePath("/")
  return { ok: true }
}

/**
 * Alta de tarea. `priority`, `due_date` y `owner_id` son opcionales: el
 * checklist del proyecto no los manda, el alta rápida del panel sí.
 */
export async function addTask(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  const supabase = await createClient()
  const projectId = str(fd, "project_id")
  const title = str(fd, "title")
  if (!projectId) return { error: "Elegí un proyecto." }
  if (!title) return { error: "Falta el título." }

  const priority = str(fd, "priority")
  const dueDate = str(fd, "due_date")
  const ownerId = str(fd, "owner_id")

  const { count } = await supabase
    .from("project_tasks")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)

  const { error } = await supabase.from("project_tasks").insert({
    project_id: projectId,
    title,
    position: (count ?? 0) + 1,
    ...(priority ? { priority: priority as Enums<"priority_level"> } : {}),
    ...(dueDate ? { due_date: dueDate } : {}),
    ...(ownerId ? { owner_id: ownerId } : {}),
  })
  if (error) return { error: error.message }

  revalidatePath(`/proyectos/${projectId}`)
  revalidatePath("/")
  return { ok: true }
}

/** Actualiza enlaces del proyecto (figma, repo, staging, prod, analytics). */
export async function updateProjectLinks(_prev: unknown, fd: FormData) {
  const supabase = await createClient()
  const id = str(fd, "project_id")
  if (!id) return { error: "Falta el proyecto." }

  const links = {
    figma: str(fd, "figma") || undefined,
    repo: str(fd, "repo") || undefined,
    staging: str(fd, "staging") || undefined,
    prod: str(fd, "prod") || undefined,
    analytics: str(fd, "analytics") || undefined,
    vercel: str(fd, "vercel") || undefined,
    supabase: str(fd, "supabase") || undefined,
    n8n: str(fd, "n8n") || undefined,
    docs: str(fd, "docs") || undefined,
  }

  const patch: TablesUpdate<"projects"> = { links }
  const { error } = await supabase.from("projects").update(patch).eq("id", id)
  if (error) return { error: error.message }

  revalidatePath(`/proyectos/${id}`)
  return { ok: true }
}
