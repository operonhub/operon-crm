"use server"

import { revalidatePath } from "next/cache"
import type { ActionResult } from "@/lib/action-result"
import { isAgentTransitionAllowed, type AgentStatus } from "@/lib/agents"
import { writeAudit } from "@/lib/audit"
import { authorizationMessage, requireAdmin } from "@/lib/auth"
import type { Enums } from "@/lib/supabase/types"

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim()
}

function lines(value: string): string[] {
  return [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))]
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export async function createAgent(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult<{ agentId: string }>> {
  try {
    const { supabase, profile } = await requireAdmin()
    const name = str(fd, "name")
    const purpose = str(fd, "purpose")
    const description = str(fd, "description")
    if (name.length < 2) return { error: "Escribí un nombre para el agente." }
    if (!purpose) return { error: "Definí para qué existe este agente." }
    const slug = slugify(str(fd, "slug") || name)
    if (!slug) return { error: "El identificador del agente no es válido." }

    const { data: agent, error } = await supabase
      .from("agents")
      .insert({
        name,
        slug,
        purpose,
        description: description || null,
        owner_id: str(fd, "owner_id") || profile.id,
        status: "draft",
      })
      .select("id")
      .single()
    if (error || !agent) return { error: error?.message ?? "No se pudo crear el agente." }
    await writeAudit(supabase, profile.id, "agent", agent.id, "created")
    revalidatePath("/agentes")
    return {
      ok: true,
      data: { agentId: agent.id },
      message: "Agente creado en borrador.",
    }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function updateAgent(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireAdmin()
    const id = str(fd, "agent_id")
    const name = str(fd, "name")
    const purpose = str(fd, "purpose")
    if (!id || !name || !purpose) return { error: "Completá nombre y propósito." }

    const { error } = await supabase
      .from("agents")
      .update({
        name,
        slug: slugify(str(fd, "slug") || name),
        description: str(fd, "description") || null,
        purpose,
        instructions: str(fd, "instructions") || null,
        owner_id: str(fd, "owner_id") || null,
        tools: lines(str(fd, "tools")),
        channels: lines(str(fd, "channels")),
        allowed_actions: lines(str(fd, "allowed_actions")),
        approval_required_actions: lines(str(fd, "approval_required_actions")),
      })
      .eq("id", id)
    if (error) return { error: error.message }
    await writeAudit(supabase, profile.id, "agent", id, "updated")
    revalidatePath("/agentes")
    revalidatePath(`/agentes/${id}`)
    return { ok: true, message: "Agente actualizado." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function updateAgentStatus(
  id: string,
  status: Enums<"agent_status">
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireAdmin()
    const { data: agent, error: readError } = await supabase
      .from("agents")
      .select("status")
      .eq("id", id)
      .single()
    if (readError || !agent) return { error: "Agente no encontrado." }
    if (!isAgentTransitionAllowed(agent.status as AgentStatus, status as AgentStatus)) {
      return { error: "Ese cambio de estado no está permitido." }
    }
    const { error } = await supabase
      .from("agents")
      .update({
        status,
        archived_at: status === "archived" ? new Date().toISOString() : null,
      })
      .eq("id", id)
    if (error) return { error: error.message }
    await writeAudit(supabase, profile.id, "agent", id, `status_${status}`)
    revalidatePath("/agentes")
    revalidatePath(`/agentes/${id}`)
    return { ok: true }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function decideAgentApproval(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireAdmin()
    const approvalId = str(fd, "approval_id")
    const agentId = str(fd, "agent_id")
    const status = str(fd, "status") as Enums<"agent_approval_status">
    const note = str(fd, "decision_note")
    if (!approvalId || (status !== "approved" && status !== "rejected")) {
      return { error: "Elegí aprobar o rechazar." }
    }
    if (!note) return { error: "Dejá una nota de decisión." }
    const { error } = await supabase
      .from("agent_approvals")
      .update({ status, decision_note: note })
      .eq("id", approvalId)
      .eq("status", "pending")
    if (error) return { error: error.message }
    await writeAudit(supabase, profile.id, "agent_approval", approvalId, status)
    revalidatePath("/agentes")
    if (agentId) revalidatePath(`/agentes/${agentId}`)
    revalidatePath("/bandeja")
    return { ok: true, message: status === "approved" ? "Aprobado." : "Rechazado." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}
