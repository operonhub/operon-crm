export type InternalRole = "admin" | "operador"

export type PermissionAction =
  | "client.write"
  | "opportunity.write"
  | "project.write"
  | "task.write"
  | "collaboration.write"
  | "finance.write"
  | "agent.configure"
  | "agent.approve"
  | "record.archive"
  | "role.manage"

const ADMIN_ONLY = new Set<PermissionAction>([
  "finance.write",
  "agent.configure",
  "agent.approve",
  "record.archive",
  "role.manage",
])

export function canPerform(
  role: InternalRole,
  action: PermissionAction
): boolean {
  return role === "admin" || !ADMIN_ONLY.has(action)
}

export function roleLabel(role: InternalRole): string {
  return role === "admin" ? "Fundador/admin" : "Miembro"
}
