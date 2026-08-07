"use client"

import { useActionState, useEffect, useState } from "react"
import { Upload, CheckCircle2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { importLeads, type ImportState } from "@/app/(app)/leads/actions"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Profile = { id: string; full_name: string }

const EXAMPLE = `empresa,web,contacto,email,telefono,fuente,servicio
Ferretería López,ferrelopez.com,Ana López,ana@ferrelopez.com,+54 11 5555 0001,scraping,landing_page
Óptica Vega,opticavega.com.ar,,,,,automation`

const initial: ImportState = { status: "idle" }

export function ImportCsvDialog({ profiles }: { profiles: Profile[] }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(importLeads, initial)
  const router = useRouter()

  useEffect(() => {
    if (state.status === "done") router.refresh()
  }, [state, router])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Upload className="mr-1 h-4 w-4" />
        Importar CSV
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar leads desde CSV</DialogTitle>
          <DialogDescription>
            Encabezados soportados: empresa, web, contacto, email, telefono,
            fuente, servicio, segmento. Se saltan duplicados por dominio/email.
          </DialogDescription>
        </DialogHeader>

        {state.status === "done" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 p-3 text-sm">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <div>
                <p className="font-medium text-success">
                  {state.created} lead(s) creado(s)
                </p>
                <p className="text-success/80">
                  {state.skipped} saltado(s) por duplicado
                  {state.errors.length > 0
                    ? ` · ${state.errors.length} con error`
                    : ""}
                </p>
              </div>
            </div>
            {state.errors.length > 0 && (
              <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-destructive">
                {state.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Cerrar</Button>
            </DialogFooter>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="csv">Contenido CSV</Label>
              <Textarea
                id="csv"
                name="csv"
                rows={8}
                className="font-mono text-xs"
                placeholder={EXAMPLE}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Responsable (para todos)</Label>
              <Select name="owner_id">
                <SelectTrigger>
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {state.status === "error" && (
              <p className="text-sm text-destructive">{state.message}</p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Importando…" : "Importar"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
