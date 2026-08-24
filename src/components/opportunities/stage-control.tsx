"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown } from "lucide-react"
import { moveStage } from "@/app/(app)/oportunidades/actions"
import { OPPORTUNITY_STAGES, STAGE_LABELS } from "@/lib/constants"
import { todayISO } from "@/lib/format"
import type { Enums } from "@/lib/supabase/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { StageBadge } from "@/components/stage-badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function StageControl({
  oppId,
  currentStage,
}: {
  oppId: string
  currentStage: Enums<"opportunity_stage">
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [pending, setPending] = useState(false)
  const [dialogStage, setDialogStage] =
    useState<Enums<"opportunity_stage"> | null>(null)
  const [action, setAction] = useState("")
  const [date, setDate] = useState(todayISO())

  function move(stage: Enums<"opportunity_stage">) {
    setPending(true)
    startTransition(async () => {
      const res = await moveStage(oppId, stage)
      setPending(false)
      if (!res.ok && "needsNextAction" in res) {
        setDialogStage(stage)
      } else {
        router.refresh()
      }
    })
  }

  function confirmWithAction() {
    if (!dialogStage) return
    const stage = dialogStage
    setDialogStage(null)
    setPending(true)
    startTransition(async () => {
      await moveStage(oppId, stage, action, date)
      setPending(false)
      setAction("")
      router.refresh()
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" disabled={pending} />}
        >
          <StageBadge stage={currentStage} />
          <ChevronDown className="ml-1 h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Cambiar etapa</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {OPPORTUNITY_STAGES.filter((s) => s !== currentStage).map((s) => (
              <DropdownMenuItem key={s} onClick={() => move(s)}>
                {STAGE_LABELS[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={dialogStage !== null}
        onOpenChange={(o) => !o && setDialogStage(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Próxima acción requerida</DialogTitle>
            <DialogDescription>
              Al pasar a una etapa activa hay que definir la próxima acción con
              fecha.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sc-na">Próxima acción</Label>
              <Input
                id="sc-na"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="Ej: enviar propuesta"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sc-nad">Fecha</Label>
              <Input
                id="sc-nad"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={!action || !date} onClick={confirmWithAction}>
              Mover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
