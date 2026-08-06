"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown } from "lucide-react"
import { updateProjectStatus } from "@/app/(app)/proyectos/actions"
import { PROJECT_STATUS_LABELS } from "@/lib/constants"
import type { Enums } from "@/lib/supabase/types"
import { Button } from "@/components/ui/button"
import { ProjectStatusBadge } from "@/components/project-badges"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const STATUSES = Object.keys(
  PROJECT_STATUS_LABELS
) as Enums<"project_status">[]

export function ProjectStatusControl({
  projectId,
  currentStatus,
}: {
  projectId: string
  currentStatus: Enums<"project_status">
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function change(status: Enums<"project_status">) {
    startTransition(async () => {
      await updateProjectStatus(projectId, status)
      router.refresh()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" disabled={pending} />}
      >
        <ProjectStatusBadge status={currentStatus} />
        <ChevronDown className="ml-1 h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Cambiar estado</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {STATUSES.filter((s) => s !== currentStatus).map((s) => (
          <DropdownMenuItem key={s} onClick={() => change(s)}>
            {PROJECT_STATUS_LABELS[s]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
