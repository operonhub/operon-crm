"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import type { ActionResult } from "@/lib/action-result"
import { writeAudit } from "@/lib/audit"
import {
  authorizationMessage,
  requireAdmin,
  requireMember,
} from "@/lib/auth"
import { resolveMentions } from "@/lib/collaboration"
import {
  PROJECT_AREAS,
  PROJECT_TASK_TEMPLATES,
  type ProjectArea,
} from "@/lib/constants"
import type { Enums, TablesUpdate } from "@/lib/supabase/types"

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim()
}

function revalidateProject(id: string) {
  revalidatePath("/")
  revalidatePath("/proyectos")
  revalidatePath(`/proyectos/${id}`)
  revalidatePath("/clientes")
  revalidatePath("/metricas")
}

/** Marca una oportunidad como ganada y crea cliente, proyecto y checklist. */
export async function winOpportunity(_prev: unknown, fd: FormData) {
  let projectId: string | null = null
  try {
    const { supabase, profile } = await requireMember()
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

    const { data: opportunity } = await supabase
      .from("opportunities")
      .select("id, organization_id, owner_id")
      .eq("id", opportunityId)
      .single()
    if (!opportunity) return { error: "Oportunidad no encontrada." }

    const { error: stageError } = await supabase
      .from("opportunities")
      .update({ stage: "ganado" })
      .eq("id", opportunityId)
    if (stageError) return { error: stageError.message }

    let clientId: string | null = null
    if (opportunity.organization_id) {
      const { data: existing } = await supabase
        .from("clients")
        .select("id")
        .eq("organization_id", opportunity.organization_id)
        .is("archived_at", null)
        .limit(1)
        .maybeSingle()
      clientId = existing?.id ?? null
    }
    if (!clientId) {
      const { data: client, error } = await supabase
        .from("clients")
        .insert({
          organization_id: opportunity.organization_id,
          opportunity_id: opportunityId,
          status: "activo",
          owner_id: opportunity.owner_id,
        })
        .select("id")
        .single()
      if (error || !client) return { error: error?.message ?? "No se pudo crear el cliente." }
      clientId = client.id
    }

    const { data: project, error } = await supabase
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
        owner_id: opportunity.owner_id,
      })
      .select("id")
      .single()
    if (error || !project) {
      return { error: error?.message ?? "No se pudo crear el proyecto." }
    }
    projectId = project.id

    const template = PROJECT_TASK_TEMPLATES[projectType] ?? []
    if (template.length > 0) {
      const { error: taskError } = await supabase.from("project_tasks").insert(
        template.map((task, index) => ({
          project_id: project.id,
          title: task.title,
          priority: task.priority,
          position: index + 1,
        }))
      )
      if (taskError) {
        revalidateProject(project.id)
        return {
          error: `Proyecto creado, pero falló el checklist: ${taskError.message}`,
        }
      }
    }
    await writeAudit(supabase, profile.id, "project", project.id, "created_from_opportunity", {
      opportunity_id: opportunityId,
      client_id: clientId,
    })
    revalidatePath("/oportunidades")
    revalidateProject(project.id)
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
  if (projectId) redirect(`/proyectos/${projectId}`)
  return { error: "No se pudo abrir el proyecto." }
}

export async function updateProjectStatus(
  id: string,
  status: Enums<"project_status">
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
    const { error } = await supabase.from("projects").update({ status }).eq("id", id)
    if (error) return { error: error.message }
    await writeAudit(supabase, profile.id, "project", id, `status_${status}`)
    revalidateProject(id)
    return { ok: true }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function updateProject(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
    const id = str(fd, "project_id")
    const name = str(fd, "name")
    const area = str(fd, "area") as ProjectArea
    const engagementKind = str(fd, "engagement_kind")
    const clientId = str(fd, "client_id")
    if (!id || !name) return { error: "Completá el nombre del proyecto." }
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
        name,
        area,
        engagement_kind: engagementKind,
        operational_type: str(fd, "operational_type") || null,
        client_id: engagementKind === "client" ? clientId : null,
        owner_id: str(fd, "owner_id") || null,
        scope: str(fd, "scope") || null,
        conversion_goal: str(fd, "conversion_goal") || null,
        kpi: str(fd, "kpi") || null,
        start_date: str(fd, "start_date") || null,
        due_date: str(fd, "due_date") || null,
      })
      .eq("id", id)
    if (error) return { error: error.message }
    await writeAudit(supabase, profile.id, "project", id, "updated")
    revalidateProject(id)
    return { ok: true, message: "Proyecto actualizado." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

/** Compatibilidad con el diálogo operativo existente. */
export async function updateProjectOperationalData(
  prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    if (!fd.get("name")) {
      const { supabase } = await requireMember()
      const id = str(fd, "project_id")
      const { data } = await supabase.from("projects").select("name").eq("id", id).single()
      if (data?.name) fd.set("name", data.name)
    }
    return updateProject(prev, fd)
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function toggleTask(
  taskId: string,
  status: Enums<"task_status">,
  projectId: string
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
    const { error } = await supabase
      .from("project_tasks")
      .update({
        status,
        completed_at: status === "completada" ? new Date().toISOString() : null,
      })
      .eq("id", taskId)
    if (error) return { error: error.message }
    await writeAudit(supabase, profile.id, "project_task", taskId, `status_${status}`)
    revalidateProject(projectId)
    return { ok: true }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function addTask(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
    const projectId = str(fd, "project_id")
    const title = str(fd, "title")
    if (!projectId) return { error: "Elegí un proyecto." }
    if (!title) return { error: "Falta el título." }
    const { count } = await supabase
      .from("project_tasks")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("archived_at", null)
    const { data: task, error } = await supabase
      .from("project_tasks")
      .insert({
        project_id: projectId,
        title,
        description: str(fd, "description") || null,
        position: (count ?? 0) + 1,
        priority:
          (str(fd, "priority") as Enums<"priority_level">) || "media",
        due_date: str(fd, "due_date") || null,
        owner_id: str(fd, "owner_id") || null,
      })
      .select("id")
      .single()
    if (error || !task) return { error: error?.message ?? "No se pudo crear la tarea." }
    await writeAudit(supabase, profile.id, "project_task", task.id, "created")
    revalidateProject(projectId)
    return { ok: true, message: "Tarea creada." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function updateTask(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
    const taskId = str(fd, "task_id")
    const projectId = str(fd, "project_id")
    const title = str(fd, "title")
    if (!taskId || !projectId || !title) return { error: "Completá la tarea." }
    const status = str(fd, "status") as Enums<"task_status">
    const { error } = await supabase
      .from("project_tasks")
      .update({
        title,
        description: str(fd, "description") || null,
        status,
        priority: str(fd, "priority") as Enums<"priority_level">,
        owner_id: str(fd, "owner_id") || null,
        due_date: str(fd, "due_date") || null,
        position: Number(str(fd, "position")) || 0,
        completed_at: status === "completada" ? new Date().toISOString() : null,
      })
      .eq("id", taskId)
    if (error) return { error: error.message }
    await writeAudit(supabase, profile.id, "project_task", taskId, "updated")
    revalidateProject(projectId)
    return { ok: true, message: "Tarea actualizada." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function reorderTask(
  taskId: string,
  projectId: string,
  position: number
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
    if (!Number.isInteger(position) || position < 0) {
      return { error: "Posición inválida." }
    }
    const { error } = await supabase
      .from("project_tasks")
      .update({ position })
      .eq("id", taskId)
    if (error) return { error: error.message }
    await writeAudit(supabase, profile.id, "project_task", taskId, "reordered", {
      position,
    })
    revalidateProject(projectId)
    return { ok: true }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function archiveTask(
  taskId: string,
  projectId: string
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
    const { error } = await supabase
      .from("project_tasks")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", taskId)
    if (error) return { error: error.message }
    await writeAudit(supabase, profile.id, "project_task", taskId, "archived")
    revalidateProject(projectId)
    return { ok: true }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function addMilestone(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
    const projectId = str(fd, "project_id")
    const title = str(fd, "title")
    if (!projectId || !title) return { error: "Escribí el hito." }
    const { data, error } = await supabase
      .from("project_milestones")
      .insert({
        project_id: projectId,
        title,
        description: str(fd, "description") || null,
        due_date: str(fd, "due_date") || null,
      })
      .select("id")
      .single()
    if (error || !data) return { error: error?.message ?? "No se pudo crear el hito." }
    await writeAudit(supabase, profile.id, "project_milestone", data.id, "created")
    revalidateProject(projectId)
    return { ok: true, message: "Hito agregado." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function updateMilestoneStatus(
  milestoneId: string,
  projectId: string,
  status: string
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
    if (!["pending", "in_progress", "completed", "cancelled"].includes(status)) {
      return { error: "Estado de hito inválido." }
    }
    const { error } = await supabase
      .from("project_milestones")
      .update({
        status,
        completed_at: status === "completed" ? new Date().toISOString() : null,
      })
      .eq("id", milestoneId)
    if (error) return { error: error.message }
    await writeAudit(supabase, profile.id, "project_milestone", milestoneId, `status_${status}`)
    revalidateProject(projectId)
    return { ok: true }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function addBlocker(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
    const projectId = str(fd, "project_id")
    const title = str(fd, "title")
    if (!projectId || !title) return { error: "Escribí el bloqueo." }
    const { data, error } = await supabase
      .from("project_blockers")
      .insert({
        project_id: projectId,
        title,
        detail: str(fd, "detail") || null,
        owner_id: str(fd, "owner_id") || null,
      })
      .select("id")
      .single()
    if (error || !data) return { error: error?.message ?? "No se pudo crear el bloqueo." }
    await writeAudit(supabase, profile.id, "project_blocker", data.id, "created")
    revalidateProject(projectId)
    return { ok: true, message: "Bloqueo registrado." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function resolveBlocker(
  blockerId: string,
  projectId: string
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
    const { error } = await supabase
      .from("project_blockers")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: profile.id,
      })
      .eq("id", blockerId)
    if (error) return { error: error.message }
    await writeAudit(supabase, profile.id, "project_blocker", blockerId, "resolved")
    revalidateProject(projectId)
    return { ok: true }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function setProjectCollaborators(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
    const projectId = str(fd, "project_id")
    const profileIds = fd.getAll("profile_ids").map(String).filter(Boolean)
    if (!projectId) return { error: "Falta el proyecto." }
    const { error: clearError } = await supabase
      .from("project_collaborators")
      .delete()
      .eq("project_id", projectId)
    if (clearError) return { error: clearError.message }
    if (profileIds.length > 0) {
      const { error } = await supabase.from("project_collaborators").insert(
        profileIds.map((profileId) => ({
          project_id: projectId,
          profile_id: profileId,
        }))
      )
      if (error) return { error: error.message }
    }
    await writeAudit(supabase, profile.id, "project", projectId, "collaborators_updated", {
      profile_ids: profileIds,
    })
    revalidateProject(projectId)
    return { ok: true, message: "Colaboradores actualizados." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function setProjectAgents(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireAdmin()
    const projectId = str(fd, "project_id")
    const agentIds = fd.getAll("agent_ids").map(String).filter(Boolean)
    if (!projectId) return { error: "Falta el proyecto." }
    const { error: clearError } = await supabase
      .from("project_agents")
      .delete()
      .eq("project_id", projectId)
    if (clearError) return { error: clearError.message }
    if (agentIds.length > 0) {
      const { error } = await supabase.from("project_agents").insert(
        agentIds.map((agentId) => ({ project_id: projectId, agent_id: agentId }))
      )
      if (error) return { error: error.message }
    }
    await writeAudit(supabase, profile.id, "project", projectId, "agents_updated", {
      agent_ids: agentIds,
    })
    revalidateProject(projectId)
    revalidatePath("/agentes")
    return { ok: true, message: "Agentes vinculados." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function archiveProject(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireAdmin()
    const projectId = str(fd, "project_id")
    const reason = str(fd, "reason")
    const restore = fd.get("restore") === "true"
    if (!projectId) return { error: "Falta el proyecto." }
    if (!restore && !reason) return { error: "Indicá el motivo del archivado." }
    const { error } = await supabase
      .from("projects")
      .update({
        archived_at: restore ? null : new Date().toISOString(),
        archived_by: restore ? null : profile.id,
        archive_reason: restore ? null : reason,
      })
      .eq("id", projectId)
    if (error) return { error: error.message }
    await writeAudit(supabase, profile.id, "project", projectId, restore ? "restored" : "archived", {
      reason: reason || null,
    })
    revalidateProject(projectId)
    return { ok: true, message: restore ? "Proyecto restaurado." : "Proyecto archivado." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function commentOnTask(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
    const taskId = str(fd, "task_id")
    const projectId = str(fd, "project_id")
    const taskTitle = str(fd, "task_title")
    const body = str(fd, "body")
    if (!taskId || !body) return { error: "Escribí un comentario." }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
    const mentions = resolveMentions(body, profiles ?? [])
    if (mentions.unknownHandles.length > 0) {
      return {
        error: `No encontramos: ${mentions.unknownHandles.map((item) => `@${item}`).join(", ")}.`,
      }
    }
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("task_id", taskId)
      .eq("channel", "team")
      .limit(1)
      .maybeSingle()
    const { data, error } = await supabase.rpc("create_team_message", {
      p_body: body,
      p_conversation_id: existing?.id,
      p_title: existing ? undefined : `Tarea: ${taskTitle || "Comentario"}`,
      p_task_id: existing ? undefined : taskId,
      p_mention_ids: mentions.profileIds,
    })
    if (error) return { error: error.message }
    await writeAudit(supabase, profile.id, "project_task", taskId, "commented", {
      conversation: data,
    })
    revalidateProject(projectId)
    revalidatePath("/bandeja")
    return { ok: true, message: "Comentario agregado." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

/** Actualiza enlaces del proyecto. */
export async function updateProjectLinks(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
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
    await writeAudit(supabase, profile.id, "project", id, "links_updated")
    revalidateProject(id)
    return { ok: true, message: "Enlaces actualizados." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}
