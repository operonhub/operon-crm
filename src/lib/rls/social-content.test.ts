import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest"
import {
  createTestDb,
  seedIdentities,
  resetState,
  SANTIAGO,
  TOMI,
  type TestDb,
} from "./harness"

/**
 * Contenido y métricas de redes (migración 0016).
 *
 * Además de las políticas, verifica que el SQL de 0016 sea válido —incluido el
 * bloque `do $$` que genera las políticas de las cinco tablas— sin Docker y sin
 * tocar la base de producción.
 */

let db: TestDb
let accountId: string

beforeAll(async () => {
  db = await createTestDb()
  await seedIdentities(db)
}, 120_000)

beforeEach(async () => {
  await resetState(db)
  await db.admin("delete from public.social_post_metrics")
  await db.admin("delete from public.social_posts")
  await db.admin("delete from public.social_story_metrics")
  await db.admin("delete from public.social_stories")
  await db.admin("delete from public.social_follower_stats")
  await db.admin("delete from public.social_accounts")

  const [account] = await db.admin<{ id: string }>(
    `insert into public.social_accounts (zernio_account_id, platform, username)
     values ('acc_ig','instagram','operonhub') returning id`
  )
  accountId = account.id
})

afterAll(async () => {
  await db?.close()
})

async function seedPost(id = "post_1"): Promise<string> {
  const [post] = await db.admin<{ id: string }>(
    `insert into public.social_posts
       (zernio_post_id, social_account_id, platform, media_type, format, published_at)
     values ($1, $2, 'instagram', 'video', 'reel', now() - interval '3 days')
     returning id`,
    [id, accountId]
  )
  return post.id
}

describe("social_posts", () => {
  it("un miembro lee el contenido publicado", async () => {
    await seedPost()
    expect(await db.as(TOMI, "select id from public.social_posts")).toHaveLength(1)
  })

  it("un anónimo no ve nada", async () => {
    await seedPost()
    expect(await db.as(null, "select id from public.social_posts")).toHaveLength(0)
    expect(await db.as(null, "select id from public.social_post_metrics")).toHaveLength(0)
    expect(await db.as(null, "select id from public.social_follower_stats")).toHaveLength(0)
  })

  it("sólo el admin sincroniza contenido", async () => {
    const admin = await db.tryAs(
      SANTIAGO,
      `insert into public.social_posts (zernio_post_id, social_account_id, platform, format)
       values ('p_admin', $1, 'instagram', 'feed')`,
      [accountId]
    )
    expect(admin).toBeNull()

    const operador = await db.tryAs(
      TOMI,
      `insert into public.social_posts (zernio_post_id, social_account_id, platform, format)
       values ('p_operador', $1, 'instagram', 'feed')`,
      [accountId]
    )
    expect(operador).not.toBeNull()
  })

  it("no admite el mismo post dos veces", async () => {
    await seedPost("post_repetido")
    await expect(seedPost("post_repetido")).rejects.toThrow()
  })

  it("rechaza un formato fuera del catálogo", async () => {
    const error = await db.tryAs(
      SANTIAGO,
      `insert into public.social_posts (zernio_post_id, social_account_id, platform, format)
       values ('p_x', $1, 'instagram', 'tiktok')`,
      [accountId]
    )
    expect(error).not.toBeNull()
  })
})

describe("social_post_metrics", () => {
  it("guarda una sola foto por post por día", async () => {
    // Es lo que permite que el cron corra cada hora sin inflar la tabla.
    const postId = await seedPost()
    await db.admin(
      `insert into public.social_post_metrics (post_id, captured_on, views)
       values ($1, current_date, 100)`,
      [postId]
    )
    const conflicto = await db.tryAs(
      SANTIAGO,
      `insert into public.social_post_metrics (post_id, captured_on, views)
       values ($1, current_date, 143)`,
      [postId]
    )
    expect(conflicto).not.toBeNull()
  })

  it("permite fotos de días distintos para el mismo post", async () => {
    const postId = await seedPost()
    await db.admin(
      `insert into public.social_post_metrics (post_id, captured_on, views)
       values ($1, current_date - 1, 100), ($1, current_date, 143)`,
      [postId]
    )
    const filas = await db.as<{ views: number }>(
      TOMI,
      "select views from public.social_post_metrics order by captured_on"
    )
    expect(filas.map((f) => f.views)).toEqual([100, 143])
  })

  it("rechaza métricas negativas", async () => {
    const postId = await seedPost()
    const error = await db.tryAs(
      SANTIAGO,
      "insert into public.social_post_metrics (post_id, views) values ($1, -5)",
      [postId]
    )
    expect(error).not.toBeNull()
  })

  it("acota el porcentaje de abandono a 0–100", async () => {
    const postId = await seedPost()
    const error = await db.tryAs(
      SANTIAGO,
      "insert into public.social_post_metrics (post_id, skip_rate) values ($1, 140)",
      [postId]
    )
    expect(error).not.toBeNull()
  })

  it("se borran con su publicación", async () => {
    const postId = await seedPost()
    await db.admin("insert into public.social_post_metrics (post_id, views) values ($1, 10)", [postId])
    await db.admin("delete from public.social_posts where id = $1", [postId])
    expect(await db.admin("select id from public.social_post_metrics")).toHaveLength(0)
  })
})

describe("social_stories y seguidores", () => {
  it("guarda una historia con sus métricas", async () => {
    const [story] = await db.admin<{ id: string }>(
      `insert into public.social_stories
         (zernio_story_id, social_account_id, media_type, posted_at, expires_at)
       values ('st_1', $1, 'image', now(), now() + interval '24 hours')
       returning id`,
      [accountId]
    )
    await db.admin(
      `insert into public.social_story_metrics (story_id, views, replies, exits)
       values ($1, 90, 3, 12)`,
      [story.id]
    )
    expect(await db.as(TOMI, "select id from public.social_story_metrics")).toHaveLength(1)
  })

  it("una historia puede tener varias fotos, porque se mide antes de que expire", async () => {
    const [story] = await db.admin<{ id: string }>(
      `insert into public.social_stories (zernio_story_id, social_account_id, posted_at)
       values ('st_2', $1, now()) returning id`,
      [accountId]
    )
    await db.admin(
      `insert into public.social_story_metrics (story_id, views) values ($1, 40), ($1, 90)`,
      [story.id]
    )
    expect(await db.admin("select id from public.social_story_metrics")).toHaveLength(2)
  })

  it("un solo registro de seguidores por día y por cuenta", async () => {
    await db.admin(
      "insert into public.social_follower_stats (social_account_id, follower_count) values ($1, 173)",
      [accountId]
    )
    const conflicto = await db.tryAs(
      SANTIAGO,
      "insert into public.social_follower_stats (social_account_id, follower_count) values ($1, 174)",
      [accountId]
    )
    expect(conflicto).not.toBeNull()
  })
})
