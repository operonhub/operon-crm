"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Building2,
  CalendarPlus,
  FolderPlus,
  ListChecks,
  MessageSquare,
  Plus,
  Target,
  WalletCards,
} from "lucide-react"
import { addTask } from "@/app/(app)/proyectos/actions"
import {
  createActivity,
  createProject,
} from "@/app/(app)/quick-actions"
import { createClient } from "@/app/(app)/clientes/actions"
import { createTeamConversation } from "@/app/(app)/bandeja/actions"
import type { ActionResult } from "@/lib/action-result"
import {
  ACTIVITY_TYPE_LABELS,
  PRIORITY_LABELS,
  PROJECT_AREAS,
  PROJECT_AREA_LABELS,
  PROJECT_ENGAGEMENT_LABELS,
  PROJECT_TEMPLATE_TYPES,
  SERVICE_TYPE_LABELS,
} from "@/lib/constants"
import type { QuickCreateOptions } from "@/lib/dashboard/queries"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { NewFinancialRecordDialog } from "@/components/finance/new-record-dialog"
import { NewOpportunityDialog } from "@/components/opportunities/new-opportunity-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type QuickAction = (prev: unknown, fd: FormData) => Promise<ActionResult<unknown>>

type DialogKind =
  | "oportunidad"
  | "cliente"
  | "proyecto"
  | "tarea"
  | "actividad"
  | "finanzas"
  | "mensaje"

export function QuickCreateMenu({ options }: { options: QuickCreateOptions }) {
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const close = () => setDialog(null)

  const items: { kind: DialogKind; label: string; icon: React.ElementType }[] = [
    { kind: "oportunidad", label: "Nueva oportunidad", icon: Target },
    { kind: "cliente", label: "Nuevo cliente", icon: Building2 },
    { kind: "proyecto", label: "Nuevo proyecto", icon: FolderPlus },
    { kind: "tarea", label: "Nueva tarea", icon: ListChecks },
    { kind: "actividad", label: "Nueva actividad", icon: CalendarPlus },
    { kind: "finanzas", label: "Nuevo registro financiero", icon: WalletCards },
    { kind: "mensaje", label: "Nuevo mensaje interno", icon: MessageSquare },
  ]

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="sm" />}>
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
          Crear
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {items.map(({ kind, label, icon: Icon }) => (
            <DropdownMenuItem key={kind} onClick={() => setDialog(kind)}>
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <TaskDialog
        open={dialog === "tarea"}
        onClose={close}
        options={options}
      />
      <ProjectDialog
        open={dialog === "proyecto"}
        onClose={close}
        options={options}
      />
      <ClientDialog
        open={dialog === "cliente"}
        onClose={close}
        options={options}
      />
      <ActivityDialog
        open={dialog === "actividad"}
        onClose={close}
        options={options}
      />
      <NewOpportunityDialog
        profiles={options.profiles}
        organizations={options.organizations}
        showTrigger={false}
        open={dialog === "oportunidad"}
        onOpenChange={(next) => !next && close()}
      />
      <NewFinancialRecordDialog
        clients={options.clients}
        projects={options.projects}
        showTrigger={false}
        open={dialog === "finanzas"}
        onOpenChange={(next) => !next && close()}
      />
      <MessageDialog
        open={dialog === "mensaje"}
        onClose={close}
        options={options}
      />
    </>
  )
}

/**
 * Envoltorio común: ejecuta la acción en una transición para tener `pending`,
 * muestra el error dentro del diálogo y sólo cierra cuando salió bien.
 */
function QuickDialog({
  open,
  onClose,
  title,
  description,
  action,
  successMessage,
  submitLabel,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  description: string
  action: QuickAction
  successMessage: string
  submitLabel: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (!next) {
      setError(null)
      onClose()
    }
  }

  function submit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await action(null, formData)
      if (result && "error" in result) {
        setError(result.error)
        return
      }
      toast.success(successMessage)
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          {children}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

/**
 * base-ui muestra el `value` crudo en el trigger salvo que le pasemos el mapa
 * de etiquetas por `items`; sin esto se vería el UUID del proyecto.
 */
function itemsOf(list: { id: string; label: string }[]): Record<string, string> {
  return Object.fromEntries(list.map((i) => [i.id, i.label]))
}

function OwnerField({ profiles }: { profiles: QuickCreateOptions["profiles"] }) {
  const items = itemsOf(
    profiles.map((p) => ({ id: p.id, label: p.full_name }))
  )
  return (
    <Field label="Responsable">
      <Select name="owner_id" items={items}>
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
    </Field>
  )
}

function TaskDialog({
  open,
  onClose,
  options,
}: {
  open: boolean
  onClose: () => void
  options: QuickCreateOptions
}) {
  const hasProjects = options.projects.length > 0
  return (
    <QuickDialog
      open={open}
      onClose={onClose}
      title="Nueva tarea"
      description={
        hasProjects
          ? "Se agrega al checklist del proyecto que elijas."
          : "Necesitás al menos un proyecto en curso para cargar tareas."
      }
      action={addTask}
      successMessage="Tarea creada"
      submitLabel="Crear tarea"
    >
      <Field label="Proyecto">
        <Select
          name="project_id"
          required
          disabled={!hasProjects}
          items={itemsOf(
            options.projects.map((p) => ({ id: p.id, label: p.name }))
          )}
        >
          <SelectTrigger>
            <SelectValue placeholder={hasProjects ? "Elegí uno" : "Sin proyectos"} />
          </SelectTrigger>
          <SelectContent>
            {options.projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Título" htmlFor="task-title">
        <Input id="task-title" name="title" required autoComplete="off" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prioridad">
          <Select name="priority" defaultValue="media" items={PRIORITY_LABELS}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Vence" htmlFor="task-due">
          <Input id="task-due" name="due_date" type="date" />
        </Field>
      </div>
      <OwnerField profiles={options.profiles} />
    </QuickDialog>
  )
}

export function ProjectDialog({
  open,
  onClose,
  options,
}: {
  open: boolean
  onClose: () => void
  options: QuickCreateOptions
}) {
  const [engagement, setEngagement] = useState<"client" | "internal">(
    options.clients.length > 0 ? "client" : "internal"
  )

  return (
    <QuickDialog
      open={open}
      onClose={onClose}
      title="Nuevo proyecto"
      description="Asignalo a un área y definí si es interno o para un cliente."
      action={createProject}
      successMessage="Proyecto creado"
      submitLabel="Crear proyecto"
    >
      <Field label="Nombre" htmlFor="project-name">
        <Input id="project-name" name="name" required autoComplete="off" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Área">
          <Select name="area" defaultValue="sites_ecommerce" items={PROJECT_AREA_LABELS}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROJECT_AREAS.map((area) => (
                <SelectItem key={area} value={area}>{PROJECT_AREA_LABELS[area]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Modalidad">
          <Select
            name="engagement_kind"
            value={engagement}
            onValueChange={(value) => setEngagement(value as "client" | "internal")}
            items={PROJECT_ENGAGEMENT_LABELS}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(PROJECT_ENGAGEMENT_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Tipo / subtipo operativo" htmlFor="project-operational-type">
        <Input id="project-operational-type" name="operational_type" placeholder="Ej: ecommerce, SaaS, WhatsApp, SEO" />
      </Field>
      <Field label="Plantilla inicial de tareas">
        <Select
          name="type"
          defaultValue="landing_page"
          items={SERVICE_TYPE_LABELS}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROJECT_TEMPLATE_TYPES.map((value) => (
              <SelectItem key={value} value={value}>{SERVICE_TYPE_LABELS[value]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {engagement === "client" && (
        <Field label="Cliente">
          <Select
            name="client_id"
            required
            disabled={options.clients.length === 0}
            items={itemsOf(options.clients.map((c) => ({ id: c.id, label: c.name })))}
          >
            <SelectTrigger>
              <SelectValue placeholder={options.clients.length === 0 ? "Sin clientes" : "Elegí uno"} />
            </SelectTrigger>
            <SelectContent>
              {options.clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <OwnerField profiles={options.profiles} />
        <Field label="Entrega" htmlFor="project-due">
          <Input id="project-due" name="due_date" type="date" />
        </Field>
      </div>
    </QuickDialog>
  )
}

function ClientDialog({
  open,
  onClose,
  options,
}: {
  open: boolean
  onClose: () => void
  options: QuickCreateOptions
}) {
  const hasOrgs = options.organizations.length > 0
  return (
    <QuickDialog
      open={open}
      onClose={onClose}
      title="Nuevo cliente"
      description="Elegí una empresa existente o creá una nueva sin fusionar duplicados automáticamente."
      action={createClient}
      successMessage="Cliente creado"
      submitLabel="Crear cliente"
    >
      {hasOrgs && (
      <Field label="Empresa existente">
        <Select
          name="organization_id"
          items={itemsOf(
            options.organizations.map((o) => ({ id: o.id, label: o.name }))
          )}
        >
          <SelectTrigger>
            <SelectValue
              placeholder="Sin elegir"
            />
          </SelectTrigger>
          <SelectContent>
            {options.organizations.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      )}
      <Field label="O crear una empresa" htmlFor="client-organization-name">
        <Input id="client-organization-name" name="organization_name" placeholder="Nombre de la empresa" />
      </Field>
      <Field label="Sitio web" htmlFor="client-website">
        <Input id="client-website" name="website" type="url" placeholder="https://" />
      </Field>
      <OwnerField profiles={options.profiles} />
      <Field label="Notas" htmlFor="client-notes">
        <Textarea id="client-notes" name="notes" rows={2} />
      </Field>
    </QuickDialog>
  )
}

function MessageDialog({
  open,
  onClose,
  options,
}: {
  open: boolean
  onClose: () => void
  options: QuickCreateOptions
}) {
  return (
    <QuickDialog
      open={open}
      onClose={onClose}
      title="Nuevo mensaje interno"
      description="Abrí una conversación de Equipo. Podés mencionar @Santiago, @Tomi o @equipo."
      action={createTeamConversation}
      successMessage="Mensaje enviado"
      submitLabel="Abrir conversación"
    >
      <Field label="Asunto" htmlFor="message-title">
        <Input id="message-title" name="title" required />
      </Field>
      <Field label="Mensaje" htmlFor="message-body">
        <Textarea id="message-body" name="body" rows={4} required />
      </Field>
      <Field label="Le toca a">
        <Select
          name="assigned_to"
          items={itemsOf(options.profiles.map((profile) => ({ id: profile.id, label: profile.full_name })))}
        >
          <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
          <SelectContent>
            {options.profiles.map((profile) => (
              <SelectItem key={profile.id} value={profile.id}>{profile.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </QuickDialog>
  )
}

function ActivityDialog({
  open,
  onClose,
  options,
}: {
  open: boolean
  onClose: () => void
  options: QuickCreateOptions
}) {
  return (
    <QuickDialog
      open={open}
      onClose={onClose}
      title="Nueva actividad"
      description="Reuniones, llamadas y seguimientos que aparecen en la agenda."
      action={createActivity}
      successMessage="Actividad creada"
      submitLabel="Crear actividad"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo">
          <Select
            name="type"
            defaultValue="reunion"
            items={ACTIVITY_TYPE_LABELS}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ACTIVITY_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Fecha" htmlFor="activity-due">
          <Input id="activity-due" name="due_date" type="date" />
        </Field>
      </div>
      <Field label="Detalle" htmlFor="activity-body">
        <Textarea
          id="activity-body"
          name="body"
          rows={2}
          required
          placeholder="Ej: reunión de kickoff con el cliente"
        />
      </Field>
      {options.opportunities.length > 0 && (
        <Field label="Oportunidad">
          <Select
            name="opportunity_id"
            items={itemsOf(
              options.opportunities.map((o) => ({ id: o.id, label: o.title }))
            )}
          >
            <SelectTrigger>
              <SelectValue placeholder="Sin vincular" />
            </SelectTrigger>
            <SelectContent>
              {options.opportunities.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      {options.projects.length > 0 && (
        <Field label="Proyecto">
          <Select
            name="project_id"
            items={itemsOf(
              options.projects.map((p) => ({ id: p.id, label: p.name }))
            )}
          >
            <SelectTrigger>
              <SelectValue placeholder="Sin vincular" />
            </SelectTrigger>
            <SelectContent>
              {options.projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      <OwnerField profiles={options.profiles} />
    </QuickDialog>
  )
}
