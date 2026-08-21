import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRole) throw new Error("Faltan variables de Supabase.")

const db = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const now = new Date().toISOString()
const suffix = now.replace(/\D/g, "").slice(0, 14)
const label = `[QA] Evolución operativa ${suffix}`

async function one(table, values) {
  const { data, error } = await db.from(table).insert(values).select("id").single()
  if (error) throw new Error(`${table}: ${error.message}`)
  return data.id
}

async function main() {
  const { data: admin, error: adminError } = await db
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .limit(1)
    .single()
  if (adminError || !admin) throw new Error("No se encontró un perfil admin.")

  const organizationId = await one("organizations", {
    name: label,
    domain: `qa-${suffix}.operon.local`,
    notes: "Registro de QA; conservar archivado.",
  })
  const clientId = await one("clients", {
    organization_id: organizationId,
    status: "pausado",
    owner_id: admin.id,
    notes: "QA de archivado y relaciones.",
    archived_at: now,
    archived_by: admin.id,
    archive_reason: "[QA] Validación terminada",
  })
  const projectId = await one("projects", {
    name: label,
    type: "automation",
    area: "automations_crm",
    engagement_kind: "client",
    operational_type: "QA",
    status: "cerrado",
    client_id: clientId,
    owner_id: admin.id,
    scope: "Validación de relaciones explícitas y estados operativos.",
    archived_at: now,
    archived_by: admin.id,
    archive_reason: "[QA] Validación terminada",
  })
  const taskId = await one("project_tasks", {
    project_id: projectId,
    title: `${label} · tarea`,
    description: "Edición, comentario, orden y archivado.",
    status: "completada",
    priority: "alta",
    owner_id: admin.id,
    position: 1,
    due_date: now.slice(0, 10),
    completed_at: now,
    archived_at: now,
  })
  await one("project_milestones", {
    project_id: projectId,
    title: `${label} · hito`,
    status: "completed",
    completed_at: now,
  })
  await one("project_blockers", {
    project_id: projectId,
    title: `${label} · bloqueo resuelto`,
    status: "resolved",
    owner_id: admin.id,
    resolved_at: now,
    resolved_by: admin.id,
  })
  const { error: collaboratorError } = await db.from("project_collaborators").insert({
    project_id: projectId,
    profile_id: admin.id,
    responsibility: "QA",
  })
  if (collaboratorError) throw new Error(`project_collaborators: ${collaboratorError.message}`)

  const financeId = await one("financial_records", {
    record_type: "income",
    concept: label,
    currency: "ARS",
    total_amount: 1000,
    paid_amount: 0,
    due_date: now.slice(0, 10),
    client_id: clientId,
    project_id: projectId,
    notes: "QA de pago parcial inmutable y cancelación.",
    updated_by: admin.id,
  })
  await one("financial_payments", {
    financial_record_id: financeId,
    amount: 400,
    paid_on: now.slice(0, 10),
    note: "[QA] Pago parcial",
    created_by: admin.id,
  })
  const { error: cancelError } = await db
    .from("financial_records")
    .update({
      canceled_at: now,
      canceled_by: admin.id,
      cancel_reason: "[QA] Validación terminada",
      updated_by: admin.id,
    })
    .eq("id", financeId)
  if (cancelError) throw new Error(`financial_records cancel: ${cancelError.message}`)

  const agentId = await one("agents", {
    name: label,
    slug: `qa-evolucion-${suffix}`,
    description: "Agente archivado de QA; sin runner ni secretos.",
    purpose: "Validar estados, ejecuciones y aprobaciones.",
    status: "archived",
    owner_id: admin.id,
    tools: ["crm_read"],
    channels: ["internal"],
    allowed_actions: ["summarize"],
    approval_required_actions: ["send_message"],
    archived_at: now,
    created_by: admin.id,
  })
  const { error: projectAgentError } = await db.from("project_agents").insert({
    project_id: projectId,
    agent_id: agentId,
    responsibility: "QA",
  })
  if (projectAgentError) throw new Error(`project_agents: ${projectAgentError.message}`)
  const runId = await one("agent_runs", {
    agent_id: agentId,
    project_id: projectId,
    client_id: clientId,
    status: "failed",
    trigger_kind: "manual",
    input_summary: "[QA] Ejecución controlada",
    error_code: "QA_COMPLETE",
    error_message: "Fallo esperado para validar métricas reales.",
    started_at: now,
    finished_at: now,
    initiated_by: admin.id,
  })
  await one("agent_approvals", {
    agent_id: agentId,
    run_id: runId,
    action_type: "external_action",
    action_summary: "[QA] Acción no ejecutada",
    status: "rejected",
    requested_by: admin.id,
    decided_at: now,
    decided_by: admin.id,
    decision_note: "[QA] Validación terminada",
  })

  const conversationId = await one("conversations", {
    title: label,
    channel: "team",
    status: "archived",
    context_type: "project",
    project_id: projectId,
    assigned_to: admin.id,
    archived_at: now,
    created_by: admin.id,
  })
  const { error: participantError } = await db.from("conversation_participants").insert({
    conversation_id: conversationId,
    profile_id: admin.id,
    last_read_at: now,
  })
  if (participantError) throw new Error(`conversation_participants: ${participantError.message}`)
  const messageId = await one("conversation_messages", {
    conversation_id: conversationId,
    author_id: admin.id,
    body: "[QA] Mensaje archivado; valida contexto, lectura y trazabilidad.",
  })
  await one("notifications", {
    recipient_id: admin.id,
    actor_id: admin.id,
    notification_type: "system",
    title: label,
    body: "QA completado y archivado.",
    href: `/bandeja?conversation=${conversationId}`,
    conversation_id: conversationId,
    message_id: messageId,
    read_at: now,
  })

  console.log(JSON.stringify({
    label,
    clientId,
    projectId,
    taskId,
    financeId,
    agentId,
    runId,
    conversationId,
    finalState: "archived/cancelled/read",
  }))
}

async function verify(labelToVerify) {
  if (!labelToVerify?.startsWith("[QA]")) throw new Error("QA_LABEL inválido.")
  const [projectRes, financeRes, agentRes, conversationRes] = await Promise.all([
    db.from("projects").select("id, client_id, archived_at").eq("name", labelToVerify).single(),
    db.from("financial_records").select("id, paid_amount, canceled_at").eq("concept", labelToVerify).single(),
    db.from("agents").select("id, status, archived_at").eq("name", labelToVerify).single(),
    db.from("conversations").select("id, project_id, status, archived_at").eq("title", labelToVerify).single(),
  ])
  for (const [name, result] of Object.entries({ projectRes, financeRes, agentRes, conversationRes })) {
    if (result.error || !result.data) throw new Error(`${name}: ${result.error?.message ?? "sin datos"}`)
  }
  const project = projectRes.data
  const finance = financeRes.data
  const agent = agentRes.data
  const conversation = conversationRes.data
  const [clientRes, paymentsRes, historyRes, runsRes, approvalsRes, messagesRes, participantsRes] = await Promise.all([
    db.from("clients").select("archived_at").eq("id", project.client_id).single(),
    db.from("financial_payments").select("id", { count: "exact", head: true }).eq("financial_record_id", finance.id),
    db.from("financial_record_history").select("id", { count: "exact", head: true }).eq("financial_record_id", finance.id),
    db.from("agent_runs").select("id", { count: "exact", head: true }).eq("agent_id", agent.id).eq("status", "failed"),
    db.from("agent_approvals").select("id", { count: "exact", head: true }).eq("agent_id", agent.id).eq("status", "rejected"),
    db.from("conversation_messages").select("id", { count: "exact", head: true }).eq("conversation_id", conversation.id),
    db.from("conversation_participants").select("profile_id", { count: "exact", head: true }).eq("conversation_id", conversation.id),
  ])
  const valid = Boolean(
    project.archived_at && clientRes.data?.archived_at &&
    finance.canceled_at && Number(finance.paid_amount) === 400 &&
    agent.status === "archived" && agent.archived_at &&
    conversation.status === "archived" && conversation.archived_at &&
    conversation.project_id === project.id &&
    (paymentsRes.count ?? 0) >= 1 && (historyRes.count ?? 0) >= 2 &&
    (runsRes.count ?? 0) === 1 && (approvalsRes.count ?? 0) === 1 &&
    (messagesRes.count ?? 0) === 1 && (participantsRes.count ?? 0) === 1
  )
  if (!valid) throw new Error("El lote QA no terminó en el estado esperado.")
  console.log(JSON.stringify({
    label: labelToVerify,
    verified: true,
    project: "archived",
    client: "archived",
    finance: "cancelled",
    paidAmount: Number(finance.paid_amount),
    payments: paymentsRes.count,
    historyEntries: historyRes.count,
    agent: "archived",
    failedRuns: runsRes.count,
    rejectedApprovals: approvalsRes.count,
    conversation: "archived/read",
  }))
}

if (process.argv.includes("--verify")) await verify(process.env.QA_LABEL)
else await main()
