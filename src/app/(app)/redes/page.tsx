import { redirect } from "next/navigation"
import { ArrowUpRight, Clapperboard, Eye, Heart, ImageIcon, Images, TriangleAlert } from "lucide-react"
import { InstagramIcon } from "@/components/brand/social-icons"
import { EmptyState } from "@/components/shell/empty-state"
import { KpiCard } from "@/components/shell/kpi-card"
import { PageHero } from "@/components/shell/page-hero"
import { UrlTabs } from "@/components/shell/url-tabs"
import { SyncContentButton } from "@/components/social/sync-content-button"
import { AutoSocialContentSync } from "@/components/social/auto-social-sync"
import { Sparkline, MeterRow } from "@/components/charts/sparkline"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { getSessionUser } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import {
  cadence,
  engagementRate,
  formatWatchTime,
  growth,
  interactions,
  retention,
  summarize,
  topPerformers,
  type PostSummary,
} from "@/lib/social/metrics"
import { readZernioConfig } from "@/lib/zernio/config"
import { cn } from "@/lib/utils"
import { PageTransition } from "@/components/shell/page-transition"

/**
 * Redes sociales — qué se publicó y cómo rindió.
 *
 * Server component puro: lee de Supabase, nunca de Zernio. La sincronización es
 * una acción aparte, porque los endpoints de analíticas comparten un
 * presupuesto de pocos pedidos por segundo para toda la cuenta.
 */

const TABS = [
  ["contenido", "Contenido"],
  ["analiticas", "Analíticas"],
] as const

const FORMATOS = [
  ["todos", "Todo"],
  ["reel", "Reels"],
  ["feed", "Posts"],
  ["story", "Historias"],
] as const

const num = (value: number) => value.toLocaleString("es-AR")
const pct = (value: number | null) =>
  value === null ? "—" : `${value.toFixed(1).replace(".", ",")}%`

function fecha(value: string | null): string {
  if (!value) return "sin fecha"
  return new Date(value).toLocaleDateString("es-AR", { day: "numeric", month: "short" })
}

function FormatIcon({ format }: { format: string }) {
  const Icon = format === "reel" ? Clapperboard : format === "story" ? Images : ImageIcon
  return <Icon className="size-3.5" aria-hidden="true" />
}

export default async function RedesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; formato?: string }>
}) {
  const params = await searchParams
  const tab = params.tab === "analiticas" ? "analiticas" : "contenido"
  const formato = FORMATOS.some(([value]) => value === params.formato)
    ? (params.formato as string)
    : "todos"

  const [supabase, user] = await Promise.all([createClient(), getSessionUser()])
  if (!user) redirect("/login")

  const [profileRes, postsRes, followersRes, syncRes, storiesRes] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase
      .from("social_posts")
      .select(
        `id, format, media_type, caption, thumbnail_url, permalink, published_at,
         video_duration_seconds, metrics_synced_at,
         metrics:social_post_metrics(captured_on, impressions, reach, likes, comments,
           shares, saves, views, follows, profile_views, avg_watch_time_ms, skip_rate)`
      )
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(200),
    supabase
      .from("social_follower_stats")
      .select("captured_on, follower_count")
      .order("captured_on"),
    supabase
      .from("social_sync_state")
      .select("last_run_at, last_success_at, last_error, metadata")
      .eq("sync_key", "content")
      .maybeSingle(),
    supabase
      .from("social_stories")
      .select("id, thumbnail_url, permalink, posted_at, media_type")
      .order("posted_at", { ascending: false })
      .limit(60),
  ])

  const isAdmin = profileRes.data?.role === "admin"
  const zernio = readZernioConfig()
  const sync = syncRes.data
  const stories = storiesRes.data ?? []

  /**
   * Las tablas de contenido llegan en la migración 0016. Si todavía no se
   * aplicó, PostgREST responde `PGRST205` y la consulta vuelve vacía — que se
   * vería igual que "no sincronizaste nada", y son dos problemas distintos con
   * dos soluciones distintas. Vale la pena distinguirlos en pantalla.
   */
  const faltaMigracion = postsRes.error?.code === "PGRST205"

  // De cada publicación se usa la foto más reciente. Las anteriores existen
  // para poder calcular evolución, no para mostrarlas todas juntas.
  const rows = postsRes.data ?? []
  const posts: (PostSummary & {
    caption: string | null
    thumbnailUrl: string | null
    permalink: string | null
  })[] = rows.map((row) => {
    const historial = [...(row.metrics ?? [])].sort((a, b) =>
      a.captured_on.localeCompare(b.captured_on)
    )
    const ultima = historial.at(-1)
    return {
      id: row.id,
      format: (row.format as PostSummary["format"]) ?? "other",
      publishedAt: row.published_at,
      videoDurationSeconds: row.video_duration_seconds,
      caption: row.caption,
      thumbnailUrl: row.thumbnail_url,
      permalink: row.permalink,
      metrics: ultima
        ? {
            impressions: ultima.impressions,
            reach: ultima.reach,
            likes: ultima.likes,
            comments: ultima.comments,
            shares: ultima.shares,
            saves: ultima.saves,
            views: ultima.views,
            follows: ultima.follows,
            profileViews: ultima.profile_views,
            avgWatchTimeMs: ultima.avg_watch_time_ms,
            skipRate: ultima.skip_rate,
          }
        : null,
    }
  })

  const resumen = summarize(posts)
  const ritmo = cadence(posts)
  const mejores = topPerformers(posts, 5)

  const followerPoints = (followersRes.data ?? []).map((row) => ({
    label: fecha(row.captured_on),
    value: row.follower_count,
  }))
  const crecimiento = growth(
    (followersRes.data ?? []).map((row) => ({
      capturedOn: row.captured_on,
      value: row.follower_count,
    }))
  )
  const seguidoresHoy = followerPoints.at(-1)?.value ?? null

  const metadata =
    sync?.metadata && typeof sync.metadata === "object" && !Array.isArray(sync.metadata)
      ? (sync.metadata as Record<string, unknown>)
      : null
  const totalPublicado =
    typeof metadata?.totalPublicado === "number" ? metadata.totalPublicado : null
  const sinMetricas =
    totalPublicado !== null ? Math.max(0, totalPublicado - resumen.withMetrics) : 0

  const visibles =
    formato === "todos" ? posts : posts.filter((post) => post.format === formato)

  return (
    <PageTransition>
    <>
    <AutoSocialContentSync enabled={isAdmin && zernio.configured} />
    <PageHero
      tone="featured"
      eyebrow="Marketing"
      title={
        <span className="inline-flex items-center gap-3">
          <InstagramIcon className="size-[0.8em]" />
          Redes sociales
        </span>
      }
      description="Las publicaciones se actualizan automáticamente desde Instagram; las métricas aparecen cuando Meta las termina de procesar."
      actions={isAdmin && zernio.configured ? <SyncContentButton /> : undefined}
    />
    <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6">

      {faltaMigracion ? (
        <EmptyState
          icon={<TriangleAlert />}
          title="Falta aplicar la migración del contenido"
          description={
            <>
              Las tablas de publicaciones y métricas todavía no existen en la base. Aplicá la
              migración <code className="font-mono">0016_social_content.sql</code> desde el SQL
              Editor de Supabase y volvé a esta pantalla.
            </>
          }
        />
      ) : !zernio.configured ? (
        <EmptyState icon={<InstagramIcon />} title="Falta conectar Instagram" description={zernio.reason} />
      ) : (
        <>
          <UrlTabs
            id="redes"
            className="mb-4"
            active={tab}
            tabs={TABS.map(([value, label]) => ({ value, label, href: `/redes?tab=${value}` }))}
          />

          {posts.length === 0 && (
            <EmptyState
              size="sm"
              className="mb-4"
              icon={<InstagramIcon />}
              title="Todavía no hay contenido sincronizado"
              description={
                isAdmin
                  ? "Tocá «Sincronizar contenido» para traer las publicaciones de Instagram."
                  : "Un admin tiene que sincronizar el contenido desde esta pantalla."
              }
            />
          )}

          {sinMetricas > 0 && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border bg-muted/40 px-4 py-3 text-xs">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              <p>
                <strong className="font-medium">
                  {resumen.withMetrics} de {totalPublicado} publicaciones tienen métricas.
                </strong>{" "}
                Instagram devuelve los insights con retraso y Zernio los trae por tandas, así que
                el resto va a ir apareciendo. No significa que hayan rendido cero.
              </p>
            </div>
          )}

          {tab === "contenido" ? (
            <>
              <UrlTabs
                id="redes-formato"
                size="sm"
                className="mb-4"
                active={formato}
                tabs={FORMATOS.map(([value, label]) => ({
                  value,
                  label,
                  href: `/redes?tab=contenido&formato=${value}`,
                  count:
                    value === "todos"
                      ? posts.length
                      : value === "story"
                        ? stories.length
                        : posts.filter((p) => p.format === value).length,
                }))}
              />

              {formato === "story" ? (
                <StoriesGrid stories={stories} />
              ) : (
                <ContentGrid posts={visibles} />
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard index={0} label="Publicaciones" value={resumen.posts} hint={`${resumen.reels} reels`} icon={<ImageIcon />} />
                <KpiCard index={1} label="Alcance" value={resumen.reach} hint="personas distintas" tone="primary" icon={<Eye />} />
                <KpiCard index={2} label="Vistas" value={resumen.views} icon={<Clapperboard />} />
                <KpiCard
                  index={3}
                  label="Interacciones / alcance"
                  value={resumen.engagementRate}
                  format={{ kind: "percent", decimals: 1 }}
                  hint={`${num(resumen.interactions)} interacciones`}
                  icon={<Heart />}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <Card>
                  <CardContent className="p-5">
                    <p className="label-mono text-muted-foreground">Mejor rendimiento</p>
                    <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
                      Ordenado por interacciones sobre alcance, no por vistas: las vistas se
                      acumulan con el tiempo, así que ese ranking premiaría a lo más viejo.
                    </p>

                    {mejores.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        Todavía no hay publicaciones con métricas para rankear.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {mejores.map((post) => {
                          const ret = post.retention
                          return (
                            <MeterRow
                              key={post.id}
                              label={`${post.format === "reel" ? "Reel" : "Post"} · ${fecha(post.publishedAt)}${
                                ret !== null ? ` · ${pct(ret)} del video visto` : ""
                              }`}
                              value={post.engagementRate}
                              max={mejores[0].engagementRate}
                              hint={pct(post.engagementRate)}
                            />
                          )
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <Card>
                    <CardContent className="p-5">
                      <p className="label-mono text-muted-foreground">Ritmo de publicación</p>
                      {ritmo.state === "sin_datos" ? (
                        <p className="mt-2 text-sm text-muted-foreground">Sin publicaciones.</p>
                      ) : (
                        <>
                          <p
                            className={cn(
                              "mt-1 font-mono text-2xl tabular-nums",
                              ritmo.state === "frenado" && "text-destructive"
                            )}
                          >
                            {ritmo.daysSinceLastPost} días
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            desde la última publicación · {ritmo.postsPerWeek}/semana en los
                            últimos 30 días
                          </p>
                          <Badge
                            variant={ritmo.state === "activo" ? "secondary" : "outline"}
                            className={cn("mt-2", ritmo.state === "frenado" && "text-destructive")}
                          >
                            {ritmo.state === "frenado"
                              ? "Frenado"
                              : ritmo.state === "irregular"
                                ? "Irregular"
                                : "Activo"}
                          </Badge>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-5">
                      <p className="label-mono text-muted-foreground">Seguidores</p>
                      <p className="mt-1 font-mono text-2xl tabular-nums">
                        {seguidoresHoy !== null ? num(seguidoresHoy) : "—"}
                      </p>
                      {crecimiento && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {crecimiento.delta >= 0 ? "+" : ""}
                          {num(crecimiento.delta)} desde la primera medición
                        </p>
                      )}
                      <div className="mt-3">
                        <Sparkline
                          points={followerPoints}
                          emptyLabel="El histórico empieza el día que se prende la sincronización: todavía hay una sola medición."
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {sync?.last_run_at && (
                <p className="label-mono text-muted-foreground">
                  última sincronización{" "}
                  {new Date(sync.last_run_at).toLocaleString("es-AR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {sync.last_error ? ` · con errores: ${sync.last_error}` : ""}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
    </>
    </PageTransition>
  )
}

function ContentGrid({
  posts,
}: {
  posts: (PostSummary & { caption: string | null; thumbnailUrl: string | null; permalink: string | null })[]
}) {
  if (posts.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Sin publicaciones de este tipo.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {posts.map((post) => {
        const tasa = post.metrics ? engagementRate(post.metrics) : null
        const ret = post.metrics
          ? retention(post.metrics.avgWatchTimeMs, post.videoDurationSeconds)
          : null

        return (
          <Card key={post.id} className="overflow-hidden py-0">
            <CardContent className="p-0">
              <div className="relative aspect-[4/5] bg-muted">
                {post.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- CDN de Meta con URLs firmadas y efímeras: no se puede optimizar desde Next.
                  <img
                    src={post.thumbnailUrl}
                    alt={post.caption?.slice(0, 80) ?? "Publicación"}
                    className="size-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <FormatIcon format={post.format} />
                  </div>
                )}
                <Badge className="absolute left-2 top-2 gap-1" variant="secondary">
                  <FormatIcon format={post.format} />
                  {post.format === "reel" ? "Reel" : "Post"}
                </Badge>
              </div>

              <div className="space-y-2 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="label-mono text-muted-foreground">
                    {fecha(post.publishedAt)}
                  </span>
                  {post.permalink && (
                    <a
                      href={post.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="label-mono inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground"
                    >
                      ver <ArrowUpRight className="size-3" aria-hidden="true" />
                    </a>
                  )}
                </div>

                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {post.caption ?? "Sin texto"}
                </p>

                {post.metrics ? (
                  <div className="grid grid-cols-3 gap-1 border-t pt-2">
                    <Metric label="vistas" value={num(post.metrics.views)} />
                    <Metric label="alcance" value={num(post.metrics.reach)} />
                    <Metric label="interac." value={num(interactions(post.metrics))} />
                    <Metric label="tasa" value={pct(tasa)} />
                    {post.format === "reel" && (
                      <>
                        <Metric label="visto" value={pct(ret)} />
                        <Metric
                          label="promedio"
                          value={formatWatchTime(post.metrics.avgWatchTimeMs)}
                        />
                      </>
                    )}
                  </div>
                ) : (
                  <p className="border-t pt-2 text-xs text-muted-foreground">
                    Instagram todavía no devolvió las métricas.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label-mono text-muted-foreground">{label}</p>
      <p className="font-mono text-xs tabular-nums">{value}</p>
    </div>
  )
}

function StoriesGrid({
  stories,
}: {
  stories: { id: string; thumbnail_url: string | null; permalink: string | null; posted_at: string; media_type: string | null }[]
}) {
  if (stories.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center">
          <p className="font-heading font-semibold">Sin historias guardadas</p>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            Instagram borra las historias a las 24 horas y no guarda histórico de las viejas. El
            archivo se construye desde el día que se prende la sincronización: sólo se capturan
            las que estén activas cuando corre.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-6">
      {stories.map((story) => (
        <Card key={story.id} className="overflow-hidden py-0">
          <CardContent className="p-0">
            <div className="relative aspect-[9/16] bg-muted">
              {story.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- CDN de Meta con URLs firmadas y efímeras.
                <img
                  src={story.thumbnail_url}
                  alt="Historia"
                  className="size-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  <Images className="size-4" aria-hidden="true" />
                </div>
              )}
            </div>
            <p className="label-mono p-2 text-muted-foreground">{fecha(story.posted_at)}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
