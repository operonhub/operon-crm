"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { ProjectDialog } from "@/components/dashboard/quick-create"
import { Button } from "@/components/ui/button"
import type { QuickCreateOptions } from "@/lib/dashboard/queries"

export function ProjectCreateButton({ options }: { options: QuickCreateOptions }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="mr-1 size-4" />Nuevo proyecto</Button>
      <ProjectDialog open={open} onClose={() => setOpen(false)} options={options} />
    </>
  )
}
