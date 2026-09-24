"use server"

import { revalidatePath } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { ActionResult } from "@/lib/action-result"
import { writeAudit } from "@/lib/audit"
import { authorizationMessage, requireAdmin } from "@/lib/auth"
import {
  getFollowerStats,
  listContent,
  listStories,
  syncExternalPosts,
} from "@/lib/zernio/client"
import { readZernioConfig } from "@/lib/zernio/config"
import type { NormalizedPost } from "@/lib/zernio/content"
import type { Database } from "@/lib/supabase/types"

/**
 * Sincronización del contenido de redes.
 *
 * Se dispara a mano desde la pantalla y, más adelante, desde un cron. Nunca
 * desde el render: los endpoints de analíticas de Zernio comparten un
 * presupuesto de 6 a 20 pedidos por segundo para toda la cuenta.
 *
 * Guarda **una foto por día** de cada publicación en vez de pisar el total.
 * Correrla varias veces el mismo día actualiza la foto de hoy; correrla mañana
 * agrega una nueva, y la diferencia entre las dos es lo que permite decir
 * cuánto sumó esta semana.
 */

const SYNC_KEY = "content"
const AUTO_SYNC_AFTER_MS = 10 * 60_000

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function syncSocialContent(): Promise<
  ActionResult<{ posts: number; stories: number; skipped?: boolean }>
> {
  let supabase: SupabaseClient<Database>
  let profileId: string

  try {
    const admin = await requireAdmin()
    supabase = admin.supabase
    profileId = admin.profile.id
  } catch (error) {
    return { error: authorizationMessage(error) }
  }

  const config = readZernioConfig()
  if (!config.configured) return { error: config.reason }

  // Sólo Instagram: WhatsApp informa `analyticsSupported: false`, no tiene
  // contenido que medir.
  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("id, zernio_account_id")
    .eq("platform", "instagram")
    .eq("is_active", true)

  if (!accounts || accounts.length === 0) {
    return {
      error:
        "No hay ninguna cuenta de Instagram sincronizada. Sincronizá las cuentas en Conexiones primero.",
    }
  }

  const now = new Date().toISOString()
  const capturedOn = today()
  let postsGuardados = 0
  let storiesGuardadas = 0
  let totalPublicado = 0
  const errores: string[] = []
  const postIds = new Set<string>()

  async function savePost(accountId: string, post: NormalizedPost) {
    // No se manda `metrics_synced_at` si todavía no hay insights: el refresco
    // nativo de Instagram no puede borrar la marca válida de una sincronización
    // analítica anterior.
    const record = {
      zernio_post_id: post.externalId,
      social_account_id: accountId,
      platform: post.platform,
      media_type: post.mediaType,
      format: post.format,
      caption: post.caption,
      thumbnail_url: post.thumbnailUrl,
      permalink: post.permalink,
      published_at: post.publishedAt,
      video_duration_seconds: post.videoDurationSeconds,
      is_ad: post.isAd,
      ...(post.metrics ? { metrics_synced_at: now } : {}),
    }
    const { data: fila, error } = await supabase
      .from("social_posts")
      .upsert(record, { onConflict: "zernio_post_id" })
      .select("id")
      .single()

    if (error || !fila) {
      errores.push("No se pudo guardar una publicación de Instagram.")
      return
    }

    postIds.add(post.externalId)
    if (!post.metrics) return

    const { error: metricsError } = await supabase.from("social_post_metrics").upsert(
      {
        post_id: fila.id,
        captured_on: capturedOn,
        impressions: post.metrics.impressions,
        reach: post.metrics.reach,
        likes: post.metrics.likes,
        comments: post.metrics.comments,
        shares: post.metrics.shares,
        saves: post.metrics.saves,
        views: post.metrics.views,
        follows: post.metrics.follows,
        profile_views: post.metrics.profileViews,
        avg_watch_time_ms: post.metrics.avgWatchTimeMs,
        skip_rate: post.metrics.skipRate,
        captured_at: now,
      },
      { onConflict: "post_id,captured_on" }
    )
    if (metricsError) errores.push("No se pudieron guardar las métricas de una publicación.")
  }

  for (const account of accounts) {
    // ---------- Publicaciones ----------
    // Primero se pide el refresco nativo: Analytics puede tardar horas en
    // entregar insights, pero no debe esconder posts publicados en Instagram.
    const external = await syncExternalPosts({ config }, { accountId: account.zernio_account_id })
    if (!external.ok) {
      errores.push(external.message)
    } else {
      totalPublicado += external.data.posts.length
      for (const post of external.data.posts) await savePost(account.id, post)
    }

    // Analytics sí se pagina: una cuenta con más de cien publicaciones con
    // insights no puede quedar cortada en la primera página.
    let analyticsPage = 1
    let analyticsPages = 1
    let firstAnalytics: Awaited<ReturnType<typeof listContent>> | null = null
    while (analyticsPage <= analyticsPages && analyticsPage <= 20) {
      const content = await listContent(
        { config },
        { accountId: account.zernio_account_id, limit: 100, page: analyticsPage }
      )
      if (!content.ok) {
        errores.push(content.message)
        break
      }
      firstAnalytics ??= content
      analyticsPages = content.data.pages ?? 1
      if (!external.ok && analyticsPage === 1) {
        totalPublicado += content.data.totalPosts ?? content.data.posts.length
      }
      for (const post of content.data.posts) await savePost(account.id, post)
      analyticsPage += 1
    }

    const analytics = firstAnalytics?.ok ? firstAnalytics.data : null

      // ---------- Seguidores ----------
      // `followerCount` del snapshot es el número vivo; la historia de Zernio
      // tarda 24 h en poblarse. Guardamos el vivo para construir la nuestra.
      if (analytics?.followerCount !== null && analytics?.followerCount !== undefined) {
        const followers = await getFollowerStats({ config }, { accountId: account.zernio_account_id })

        await supabase.from("social_follower_stats").upsert(
          {
            social_account_id: account.id,
            captured_on: capturedOn,
            follower_count: analytics.followerCount,
            gained: followers.ok ? followers.data.gained : null,
            lost: followers.ok ? followers.data.lost : null,
            captured_at: now,
          },
          { onConflict: "social_account_id,captured_on" }
        )
      }

    // ---------- Historias ----------
    const stories = await listStories({ config }, { accountId: account.zernio_account_id })

    if (!stories.ok) {
      errores.push(stories.message)
    } else {
      for (const story of stories.data) {
        await supabase.from("social_stories").upsert(
          {
            zernio_story_id: story.externalId,
            social_account_id: account.id,
            media_type: story.mediaType,
            thumbnail_url: story.thumbnailUrl,
            permalink: story.permalink,
            posted_at: story.postedAt,
            expires_at: story.expiresAt,
            last_seen_at: now,
          },
          { onConflict: "zernio_story_id" }
        )
        storiesGuardadas += 1
      }
    }
  }

  await supabase.from("social_sync_state").upsert(
    {
      sync_key: SYNC_KEY,
      last_run_at: now,
      last_success_at: errores.length === 0 ? now : null,
      last_error: errores.length > 0 ? errores.join(" · ") : null,
      items_synced: postIds.size,
      // El total publicado según Zernio, para poder explicar en pantalla por
      // qué hay menos publicaciones con métricas que publicaciones.
      metadata: { totalPublicado, storiesGuardadas },
    },
    { onConflict: "sync_key" }
  )

  postsGuardados = postIds.size
  await writeAudit(supabase, profileId, "social_content", null, "synced", {
    posts: postsGuardados,
    stories: storiesGuardadas,
  })

  revalidatePath("/redes")

  if (errores.length > 0 && postsGuardados === 0) {
    return { error: errores[0] }
  }

  const faltantes = Math.max(0, totalPublicado - postsGuardados)
  return {
    ok: true,
    data: { posts: postsGuardados, stories: storiesGuardadas },
    message:
      faltantes > 0
        ? `${postsGuardados} publicaciones actualizadas. A ${faltantes} Instagram todavía no les devolvió insights.`
        : `${postsGuardados} publicaciones y ${storiesGuardadas} historias sincronizadas.`,
  }
}

/** El navegador puede pedir una actualización, pero no gastar API en cada foco. */
export async function syncSocialContentIfStale(): Promise<
  ActionResult<{ posts: number; stories: number; skipped?: boolean }>
> {
  let supabase: SupabaseClient<Database>
  try {
    const admin = await requireAdmin()
    supabase = admin.supabase
  } catch (error) {
    return { error: authorizationMessage(error) }
  }

  const { data: state } = await supabase
    .from("social_sync_state")
    .select("last_run_at")
    .eq("sync_key", SYNC_KEY)
    .maybeSingle()
  const lastRun = state?.last_run_at ? new Date(state.last_run_at).getTime() : 0
  if (lastRun && Date.now() - lastRun < AUTO_SYNC_AFTER_MS) {
    return { ok: true, data: { posts: 0, stories: 0, skipped: true } }
  }

  return syncSocialContent()
}
