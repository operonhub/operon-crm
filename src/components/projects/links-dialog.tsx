"use client"

import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Link2 } from "lucide-react"
import { updateProjectLinks } from "@/app/(app)/proyectos/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export type ProjectLinks = {
  figma?: string
  repo?: string
  staging?: string
  prod?: string
  analytics?: string
}

const FIELDS: { key: keyof ProjectLinks; label: string }[] = [
  { key: "figma", label: "Figma" },
  { key: "repo", label: "Repositorio" },
  { key: "staging", label: "Staging" },
  { key: "prod", label: "Producción" },
  { key: "analytics", label: "Analytics" },
]

export function LinksDialog({
  projectId,
  links,
}: {
  projectId: string
  links: ProjectLinks
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(
    updateProjectLinks,
    null as { ok?: boolean; error?: string } | null
  )
  const router = useRouter()

  useEffect(() => {
    if (state?.ok) {
      setOpen(false)
      router.refresh()
    }
  }, [state, router])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Link2 className="mr-1 h-4 w-4" />
        Editar enlaces
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enlaces del proyecto</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="project_id" value={projectId} />
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={f.key}>{f.label}</Label>
              <Input
                id={f.key}
                name={f.key}
                type="url"
                placeholder="https://…"
                defaultValue={links[f.key] ?? ""}
              />
            </div>
          ))}
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
