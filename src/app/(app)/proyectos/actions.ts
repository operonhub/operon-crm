"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { PROJECT_TASK_TEMPLATES } from "@/lib/constants"
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

  if (!opportunityId) return { error: "Falta la oportunidad." }
  if (!projectName) return { error: "El nombre del proyecto es obligatorio." }

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

export async function toggleTask(
  taskId: string,
  status: Enums<"task_status">,
  projectId: string
) {
  const supabase = await createClient()
  await supabase.from("project_tasks").update({ status }).eq("id", taskId)
  revalidatePath(`/proyectos/${projectId}`)
}

export async function addTask(_prev: unknown, fd: FormData) {
  const supabase = await createClient()
  const projectId = str(fd, "project_id")
  const title = str(fd, "title")
  if (!projectId || !title) return { error: "Falta el título." }

  const { count } = await supabase
    .from("project_tasks")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)

  const { error } = await supabase.from("project_tasks").insert({
    project_id: projectId,
    title,
    position: (count ?? 0) + 1,
  })
  if (error) return { error: error.message }

  revalidatePath(`/proyectos/${projectId}`)
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
  }

  const patch: TablesUpdate<"projects"> = { links }
  const { error } = await supabase.from("projects").update(patch).eq("id", id)
  if (error) return { error: error.message }

  revalidatePath(`/proyectos/${id}`)
  return { ok: true }
}
