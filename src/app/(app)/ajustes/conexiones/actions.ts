"use server"

import { revalidatePath } from "next/cache"
import type { ActionResult } from "@/lib/action-result"
import { writeAudit } from "@/lib/audit"
import { authorizationMessage, requireAdmin } from "@/lib/auth"
import { listAccounts } from "@/lib/zernio/client"
import { readZernioConfig } from "@/lib/zernio/config"

/** Clave de la fila de `social_sync_state` que corresponde a esta tarea. */
const SYNC_KEY = "accounts"

/**
 * Trae de Zernio las cuentas conectadas y las espeja en `social_accounts`.
 *
 * Es la única acción de la Fase 0 que sale a internet. El resto de la app lee
 * siempre de Supabase: la doc de Zernio es explícita en que un dashboard no
 * debe llamar a su API en cada render.
 */
export async function syncZernioAccounts(): Promise<
  ActionResult<{ synced: number; deactivated: number }>
> {
  let supabase
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

  const result = await listAccounts({ config })

  // El fallo también se registra: si la sincronización viene fallando hace
  // tres días, eso tiene que verse en la pantalla y no sólo en un log.
  if (!result.ok) {
    await supabase.from("social_sync_state").upsert(
      {
        sync_key: SYNC_KEY,
        last_run_at: new Date().toISOString(),
        last_error: result.message,
      },
      { onConflict: "sync_key" }
    )
    revalidatePath("/ajustes/conexiones")
    return { error: result.message }
  }

  const now = new Date().toISOString()
  const { accounts, hasAnalyticsAccess } = result.data

  if (accounts.length > 0) {
    const { error } = await supabase.from("social_accounts").upsert(
      accounts.map((account) => ({
        zernio_account_id: account.zernioAccountId,
        zernio_profile_id: account.zernioProfileId,
        platform: account.platform,
        username: account.username,
        display_name: account.displayName,
        profile_url: account.profileUrl,
        avatar_url: account.avatarUrl,
        is_active: account.isActive,
        follower_count: account.followerCount,
        last_synced_at: now,
      })),
      { onConflict: "zernio_account_id" }
    )
    if (error) return { error: "No se pudieron guardar las cuentas sincronizadas." }
  }

  /**
   * Una cuenta que Zernio dejó de listar es una cuenta desconectada, y hay que
   * apagarla para que la Bandeja no la muestre como viva.
   *
   * Pero sólo cuando la respuesta entró completa: si alguna vez llegan 100
   * cuentas —el tope de página que pedimos— la lista está truncada y apagar
   * "las que faltan" apagaría cuentas que sí existen.
   */
  let deactivated = 0
  if (accounts.length < 100) {
    const ids = accounts.map((account) => account.zernioAccountId)
    const query = supabase
      .from("social_accounts")
      .update({ is_active: false, last_synced_at: now })
      .eq("is_active", true)

    const { data } = ids.length
      ? await query.not("zernio_account_id", "in", `(${ids.join(",")})`).select("id")
      : await query.select("id")

    deactivated = data?.length ?? 0
  }

  await supabase.from("social_sync_state").upsert(
    {
      sync_key: SYNC_KEY,
      last_run_at: now,
      last_success_at: now,
      last_error: null,
      items_synced: accounts.length,
      metadata: { hasAnalyticsAccess },
    },
    { onConflict: "sync_key" }
  )

  await writeAudit(supabase, profileId, "social_account", null, "synced", {
    synced: accounts.length,
    deactivated,
  })

  revalidatePath("/ajustes/conexiones")
  revalidatePath("/bandeja")

  return {
    ok: true,
    data: { synced: accounts.length, deactivated },
    message:
      accounts.length === 0
        ? "Zernio respondió bien, pero todavía no hay ninguna cuenta conectada."
        : `Se sincronizaron ${accounts.length} cuenta(s).`,
  }
}
