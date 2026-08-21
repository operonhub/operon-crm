export type AgentStatus = "draft" | "active" | "paused" | "archived"
export type AgentRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
export type AgentApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"

type RunMetricInput = {
  status: AgentRunStatus
  started_at: string | null
  finished_at: string | null
}

type ApprovalMetricInput = { status: AgentApprovalStatus }

export type AgentMetrics = {
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  pendingApprovals: number
  successRate: number | null
  averageDurationSeconds: number | null
}

export function deriveAgentMetrics(
  runs: RunMetricInput[],
  approvals: ApprovalMetricInput[]
): AgentMetrics {
  const successfulRuns = runs.filter((run) => run.status === "succeeded").length
  const failedRuns = runs.filter((run) => run.status === "failed").length
  const completedRuns = successfulRuns + failedRuns
  const durations = runs.flatMap((run) => {
    if (!run.started_at || !run.finished_at) return []
    const duration =
      (new Date(run.finished_at).getTime() -
        new Date(run.started_at).getTime()) /
      1000
    return Number.isFinite(duration) && duration >= 0 ? [duration] : []
  })

  return {
    totalRuns: runs.length,
    successfulRuns,
    failedRuns,
    pendingApprovals: approvals.filter((item) => item.status === "pending").length,
    successRate:
      completedRuns === 0
        ? null
        : Math.round((successfulRuns / completedRuns) * 100),
    averageDurationSeconds:
      durations.length === 0
        ? null
        : Math.round(
            durations.reduce((total, duration) => total + duration, 0) /
              durations.length
          ),
  }
}

const AGENT_TRANSITIONS: Record<AgentStatus, AgentStatus[]> = {
  draft: ["active", "archived"],
  active: ["paused"],
  paused: ["active", "archived"],
  archived: [],
}

export function isAgentTransitionAllowed(
  from: AgentStatus,
  to: AgentStatus
): boolean {
  return from === to || AGENT_TRANSITIONS[from].includes(to)
}
