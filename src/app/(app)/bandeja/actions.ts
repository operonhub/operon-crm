"use server"

import { revalidatePath } from "next/cache"
import type { ActionResult } from "@/lib/action-result"
import { authorizationMessage, requireMember } from "@/lib/auth"
import { writeAudit } from "@/lib/audit"
import { resolveMentions } from "@/lib/collaboration"
import { todayISO } from "@/lib/format"
import type { Enums } from "@/lib/supabase/types"

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim()
}

function optional(value: string): string | undefined {
  return value || undefined
}

async function resolveMentionIds(
  body: string,
  supabase: Awaited<ReturnType<typeof requireMember>>["supabase"]
) {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .order("full_name")
  if (error) throw new Error(error.message)
  return resolveMentions(body, profiles ?? [])
}

export async function createTeamConversation(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult<{ conversationId: string }>> {
  try {
    const { supabase, profile } = await requireMember()
    const title = str(fd, "title")
    const body = str(fd, "body")
    if (!title) return { error: "Escribí un asunto." }
    if (!body) return { error: "Escribí un mensaje." }

    const mentions = await resolveMentionIds(body, supabase)
    if (mentions.unknownHandles.length > 0) {
      return {
        error: `No encontramos: ${mentions.unknownHandles
          .map((handle) => `@${handle}`)
          .join(", ")}.`,
      }
    }

    const { data, error } = await supabase.rpc("create_team_message", {
      p_title: title,
      p_body: body,
      p_mention_ids: mentions.profileIds,
      p_assigned_to: optional(str(fd, "assigned_to")),
      p_client_id: optional(str(fd, "client_id")),
      p_opportunity_id: optional(str(fd, "opportunity_id")),
      p_project_id: optional(str(fd, "project_id")),
      p_task_id: optional(str(fd, "task_id")),
      p_financial_record_id: optional(str(fd, "financial_record_id")),
      p_agent_id: optional(str(fd, "agent_id")),
    })
    if (error) return { error: error.message }
    const payload = data as { conversation_id?: string } | null
    const conversationId = payload?.conversation_id
    if (!conversationId) return { error: "No se pudo abrir la conversación." }

    await writeAudit(supabase, profile.id, "conversation", conversationId, "created", {
      title,
      mentions: mentions.profileIds,
    })
    revalidatePath("/bandeja")
    revalidatePath("/")
    return {
      ok: true,
      data: { conversationId },
      message: "Conversación creada.",
    }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function replyTeamConversation(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
    const conversationId = str(fd, "conversation_id")
    const body = str(fd, "body")
    if (!conversationId) return { error: "Falta la conversación." }
    if (!body) return { error: "Escribí un mensaje." }

    const mentions = await resolveMentionIds(body, supabase)
    if (mentions.unknownHandles.length > 0) {
      return {
        error: `No encontramos: ${mentions.unknownHandles
          .map((handle) => `@${handle}`)
          .join(", ")}.`,
      }
    }
    const { error } = await supabase.rpc("create_team_message", {
      p_conversation_id: conversationId,
      p_body: body,
      p_mention_ids: mentions.profileIds,
    })
    if (error) return { error: error.message }

    await writeAudit(supabase, profile.id, "conversation", conversationId, "replied")
    revalidatePath("/bandeja")
    return { ok: true, message: "Respuesta enviada." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function markConversationRead(
  conversationId: string
): Promise<ActionResult> {
  try {
    const { supabase } = await requireMember()
    const { error } = await supabase.rpc("mark_conversation_read", {
      p_conversation_id: conversationId,
    })
    if (error) return { error: error.message }
    revalidatePath("/bandeja")
    return { ok: true }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function setConversationStatus(
  conversationId: string,
  status: Enums<"conversation_status">
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
    const patch = {
      status,
      resolved_at: status === "resolved" ? new Date().toISOString() : null,
      resolved_by: status === "resolved" ? profile.id : null,
      archived_at: status === "archived" ? new Date().toISOString() : null,
    }
    const { error } = await supabase
      .from("conversations")
      .update(patch)
      .eq("id", conversationId)
    if (error) return { error: error.message }
    await writeAudit(supabase, profile.id, "conversation", conversationId, status)
    revalidatePath("/bandeja")
    return { ok: true }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function handoffConversation(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
    const conversationId = str(fd, "conversation_id")
    const toProfileId = str(fd, "to_profile_id")
    const note = str(fd, "note")
    if (!conversationId || !toProfileId) return { error: "Elegí a quién le toca." }
    if (toProfileId === profile.id) return { error: "La conversación ya está en tus manos." }

    const { error } = await supabase.from("assignment_handoffs").insert({
      conversation_id: conversationId,
      from_profile_id: profile.id,
      to_profile_id: toProfileId,
      note: note || null,
    })
    if (error) return { error: error.message }
    const { error: conversationError } = await supabase
      .from("conversations")
      .update({ assigned_to: toProfileId })
      .eq("id", conversationId)
    if (conversationError) return { error: conversationError.message }

    await supabase.rpc("create_internal_notification", {
      p_recipient_id: toProfileId,
      p_notification_type: "handoff",
      p_title: "Te toca continuar una conversación",
      p_body: note || undefined,
      p_href: `/bandeja?tab=equipo&conversation=${conversationId}`,
      p_conversation_id: conversationId,
    })
    await writeAudit(supabase, profile.id, "conversation", conversationId, "handoff", {
      to_profile_id: toProfileId,
    })
    revalidatePath("/bandeja")
    revalidatePath("/")
    return { ok: true, message: "Responsabilidad transferida." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function requestConversationReview(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
    const conversationId = str(fd, "conversation_id")
    const requestedFrom = str(fd, "requested_from")
    const note = str(fd, "note")
    if (!conversationId || !requestedFrom) return { error: "Elegí quién revisa." }
    if (requestedFrom === profile.id) return { error: "Elegí a otra persona para revisar." }
    const { error } = await supabase.from("review_requests").insert({
      conversation_id: conversationId,
      requested_by: profile.id,
      requested_from: requestedFrom,
      note: note || null,
    })
    if (error) return { error: error.message }
    await supabase.rpc("create_internal_notification", {
      p_recipient_id: requestedFrom,
      p_notification_type: "review",
      p_title: "Te pidieron una revisión",
      p_body: note || undefined,
      p_href: `/bandeja?tab=equipo&conversation=${conversationId}`,
      p_conversation_id: conversationId,
    })
    await writeAudit(supabase, profile.id, "conversation", conversationId, "review_requested")
    revalidatePath("/bandeja")
    revalidatePath("/")
    return { ok: true, message: "Revisión solicitada." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function createDecision(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
    const conversationId = str(fd, "conversation_id")
    const title = str(fd, "title")
    const body = str(fd, "body")
    if (!conversationId || !title) return { error: "Escribí la decisión." }
    const { data: decision, error } = await supabase
      .from("decisions")
      .insert({
        conversation_id: conversationId,
        title,
        body: body || null,
        decided_by: profile.id,
      })
      .select("id")
      .single()
    if (error || !decision) return { error: error?.message ?? "No se pudo registrar." }
    await supabase.rpc("create_team_message", {
      p_conversation_id: conversationId,
      p_body: `Decisión: ${title}${body ? ` — ${body}` : ""}`,
    })
    await writeAudit(supabase, profile.id, "decision", decision.id, "created", {
      conversation_id: conversationId,
    })
    revalidatePath("/bandeja")
    return { ok: true, message: "Decisión registrada." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function markNotificationRead(
  notificationId: string,
  read: boolean
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: read ? new Date().toISOString() : null })
      .eq("id", notificationId)
      .eq("recipient_id", profile.id)
    if (error) return { error: error.message }
    revalidatePath("/bandeja")
    revalidatePath("/")
    return { ok: true }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function createTaskFromConversation(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
    const conversationId = str(fd, "conversation_id")
    const projectId = str(fd, "project_id")
    const title = str(fd, "title")
    const dueDate = str(fd, "due_date")
    if (!conversationId || !projectId || !title) {
      return { error: "Elegí un proyecto y escribí la tarea." }
    }
    const { count } = await supabase
      .from("project_tasks")
      .select("id", { head: true, count: "exact" })
      .eq("project_id", projectId)
    const { data: task, error } = await supabase
      .from("project_tasks")
      .insert({
        project_id: projectId,
        title,
        due_date: dueDate || null,
        owner_id: profile.id,
        position: (count ?? 0) + 1,
      })
      .select("id")
      .single()
    if (error || !task) return { error: error?.message ?? "No se pudo crear la tarea." }
    await writeAudit(supabase, profile.id, "project_task", task.id, "created_from_conversation", {
      conversation_id: conversationId,
    })
    revalidatePath("/bandeja")
    revalidatePath(`/proyectos/${projectId}`)
    revalidatePath("/")
    return { ok: true, message: "Tarea creada." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}

export async function upsertDailyUpdate(
  _prev: unknown,
  fd: FormData
): Promise<ActionResult> {
  try {
    const { supabase, profile } = await requireMember()
    const progress = str(fd, "progress")
    const nextFocus = str(fd, "next_focus")
    const blocker = str(fd, "blocker")
    if (!progress) return { error: "Contá brevemente qué avanzaste hoy." }
    const updateDate = todayISO()
    const { data, error } = await supabase
      .from("daily_updates")
      .upsert(
        {
          profile_id: profile.id,
          update_date: updateDate,
          progress,
          next_focus: nextFocus || null,
          blocker: blocker || null,
          needs_help: fd.get("needs_help") === "on",
        },
        { onConflict: "profile_id,update_date" }
      )
      .select("id")
      .single()
    if (error || !data) return { error: error?.message ?? "No se pudo guardar." }
    await writeAudit(supabase, profile.id, "daily_update", data.id, "upserted")
    revalidatePath("/")
    return { ok: true, message: "Actualización guardada." }
  } catch (error) {
    return { error: authorizationMessage(error) }
  }
}
