import { redirect } from "next/navigation"
import { AtSign, CircleAlert, CircleCheck, MessageCircle, Plug, Workflow } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { SyncAccountsButton } from "@/components/settings/sync-accounts-button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { readHermesConfig } from "@/lib/assistant/config"
import { createClient } from "@/lib/supabase/server"
import { maskApiKey, readZernioConfig, readZernioWebhookConfig } from "@/lib/zernio/config"
import { platformLabel } from "@/lib/zernio/types"
import { cn } from "@/lib/utils"

/**
 * Conexiones — estado real de las integraciones externas.
 *
 * Todo lo que se muestra acá sale del entorno del servidor y de Supabase.
 * Ninguna tarjeta inventa un estado: cuando algo no está configurado, dice qué
 * falta. Es la primera pantalla a mirar cuando la Bandeja o Redes aparecen
 * vacías, porque distingue "no hay datos" de "no está conectado".
 */

const dateTime = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
})

function StatusBadge({ ok, okLabel, pendingLabel }: {
  ok: boolean
  okLabel: string
  pendingLabel: string
}) {
  const Icon = ok ? CircleCheck : CircleAlert
  return (
    <Badge variant={ok ? "secondary" : "outline"} className={cn(!ok && "text-muted-foreground")}>
      <Icon className={cn("size-3", ok ? "text-success" : "text-warning")} aria-hidden="true" />
      {ok ? okLabel : pendingLabel}
    </Badge>
  )
}

function Integration({
  icon: Icon,
  title,
  description,
  status,
  children,
  actions,
}: {
  icon: React.ElementType
  title: string
  description: string
  status: React.ReactNode
  children?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="font-heading text-sm font-semibold">{title}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {status}
            {actions}
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

/** Fila de dato técnico: etiqueta chica arriba, valor en mono abajo. */
function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="label-mono text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate font-mono text-xs">{value}</p>
    </div>
  )
}

export default async function ConnectionsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [profileRes, accountsRes, syncRes] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase
      .from("social_accounts")
      .select("id, platform, username, display_name, is_active, follower_count, last_synced_at")
      .order("platform"),
    supabase
      .from("social_sync_state")
      .select("sync_key, last_run_at, last_success_at, last_error, items_synced, metadata")
      .eq("sync_key", "accounts")
      .maybeSingle(),
  ])

  const isAdmin = profileRes.data?.role === "admin"
  const accounts = accountsRes.data ?? []
  const sync = syncRes.data

  // El add-on de analíticas viaja en la misma respuesta que las cuentas. Se lee
  // con cuidado porque `metadata` es jsonb libre: cualquier forma inesperada
  // tiene que quedar como "no sé", nunca como "no lo tiene".
  const syncMetadata =
    sync?.metadata && typeof sync.metadata === "object" && !Array.isArray(sync.metadata)
      ? (sync.metadata as Record<string, unknown>)
      : null
  const analyticsAccess =
    typeof syncMetadata?.hasAnalyticsAccess === "boolean"
      ? syncMetadata.hasAnalyticsAccess
      : null

  const zernio = readZernioConfig()
  const webhook = readZernioWebhookConfig()
  const hermes = readHermesConfig()
  const ingestConfigured = Boolean(process.env.N8N_INGEST_SECRET)

  return (
    <>
      <PageHeader
        title="Conexiones"
        description="Estado real de las integraciones. Lo que no está conectado, lo dice."
      />

      <div className="space-y-4 p-4 sm:p-6">
        <Integration
          icon={Plug}
          title="Zernio — WhatsApp e Instagram"
          description="Provee los chats de la Bandeja y el contenido de Redes sociales."
          status={
            <StatusBadge
              ok={zernio.configured}
              okLabel="Clave cargada"
              pendingLabel="Sin configurar"
            />
          }
          actions={isAdmin && zernio.configured ? <SyncAccountsButton /> : null}
        >
          {!zernio.configured ? (
            <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              {zernio.reason} Cargala en el entorno del servidor como{" "}
              <code className="font-mono">ZERNIO_API_KEY</code> y volvé a esta pantalla.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-4">
              <Detail label="Clave" value={maskApiKey(zernio.apiKey)} />
              <Detail label="Profile" value={zernio.profileId ?? "todos"} />
              <Detail
                label="Webhook"
                value={webhook.configured ? "secreto cargado" : "sin secreto"}
              />
              <Detail
                label="Add-on analíticas"
                value={
                  analyticsAccess === null
                    ? "sin sincronizar"
                    : analyticsAccess
                      ? "habilitado"
                      : "no contratado"
                }
              />
            </div>
          )}

          <div className="rounded-lg border">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <p className="label-mono text-muted-foreground">Cuentas conectadas</p>
              {sync?.last_success_at && (
                <p className="label-mono text-muted-foreground">
                  sincronizado {dateTime.format(new Date(sync.last_success_at))}
                </p>
              )}
            </div>

            {accounts.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">
                {zernio.configured
                  ? "Todavía no hay ninguna cuenta conectada. Se conectan desde el panel de Zernio; después tocá «Sincronizar cuentas» y aparecen acá."
                  : "Sin clave de Zernio no se pueden listar las cuentas."}
              </p>
            ) : (
              <ul className="divide-y">
                {accounts.map((account) => (
                  <li key={account.id} className="flex items-center gap-3 px-3 py-2.5">
                    {account.platform === "instagram" ? (
                      <AtSign className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    ) : (
                      <MessageCircle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {account.display_name ?? account.username ?? "Sin nombre"}
                      </p>
                      <p className="label-mono truncate text-muted-foreground">
                        {platformLabel(account.platform)}
                        {account.username ? ` · @${account.username}` : ""}
                      </p>
                    </div>
                    {account.follower_count !== null && (
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {account.follower_count.toLocaleString("es-AR")}
                      </span>
                    )}
                    <StatusBadge ok={account.is_active} okLabel="Activa" pendingLabel="Caída" />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {sync?.last_error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              Última sincronización fallida
              {sync.last_run_at ? ` (${dateTime.format(new Date(sync.last_run_at))})` : ""}:{" "}
              {sync.last_error}
            </p>
          )}
        </Integration>

        <Integration
          icon={Workflow}
          title="Ingesta de leads desde n8n"
          description="Endpoint que recibe leads automatizados y los deduplica."
          status={
            <StatusBadge
              ok={ingestConfigured}
              okLabel="Secreto cargado"
              pendingLabel="Sin configurar"
            />
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Detail label="Endpoint" value="POST /api/ingest/leads" />
            <Detail label="Autenticación" value="Authorization: Bearer · x-api-key" />
          </div>
        </Integration>

        <Integration
          icon={CircleCheck}
          title="Operon IA"
          description="Asistente del CRM, servido por Hermes."
          status={
            <StatusBadge
              ok={hermes.configured}
              okLabel="Conectado"
              pendingLabel="Sin configurar"
            />
          }
        >
          {!hermes.configured && (
            <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              {hermes.reason}
            </p>
          )}
        </Integration>
      </div>
    </>
  )
}
