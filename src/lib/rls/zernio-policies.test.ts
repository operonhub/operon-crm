import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest"
import {
  createTestDb,
  seedIdentities,
  resetState,
  SANTIAGO,
  TOMI,
  EXTRANO,
  type TestDb,
} from "./harness"

/**
 * Políticas de las tablas de Zernio (migración 0014).
 *
 * Corre las migraciones reales sobre PGlite, así que además de las políticas
 * verifica que el SQL de 0014 sea válido — sin Docker y sin tocar la base de
 * producción, que vive en otra cuenta de Supabase.
 *
 * Lo que se protege acá no es poca cosa: `social_webhook_events` guarda el
 * texto de los mensajes de WhatsApp e Instagram.
 */

let db: TestDb

beforeAll(async () => {
  db = await createTestDb()
  await seedIdentities(db)
}, 120_000)

beforeEach(async () => {
  await resetState(db)
  // `resetState` no conoce estas tablas: se limpian acá para no tocar el harness.
  await db.admin("delete from public.social_webhook_events")
  await db.admin("delete from public.social_sync_state")
  await db.admin("delete from public.social_accounts")
})

afterAll(async () => {
  await db?.close()
})

async function seedAccount(): Promise<string> {
  const [row] = await db.admin<{ id: string }>(
    `insert into public.social_accounts (zernio_account_id, platform, username)
     values ('acc_ig_1','instagram','operonhub') returning id`
  )
  return row.id
}

describe("social_accounts", () => {
  it("un miembro lee las cuentas conectadas", async () => {
    await seedAccount()
    const rows = await db.as(TOMI, "select id from public.social_accounts")
    expect(rows).toHaveLength(1)
  })

  it("un anónimo no ve ninguna cuenta", async () => {
    await seedAccount()
    const rows = await db.as(null, "select id from public.social_accounts")
    expect(rows).toHaveLength(0)
  })

  it("un autenticado sin perfil tampoco", async () => {
    await seedAccount()
    const rows = await db.as(EXTRANO, "select id from public.social_accounts")
    expect(rows).toHaveLength(0)
  })

  it("el admin conecta una cuenta", async () => {
    const error = await db.tryAs(
      SANTIAGO,
      `insert into public.social_accounts (zernio_account_id, platform)
       values ('acc_wa_1','whatsapp')`
    )
    expect(error).toBeNull()
  })

  it("un operador no conecta ni desconecta cuentas", async () => {
    const insertError = await db.tryAs(
      TOMI,
      `insert into public.social_accounts (zernio_account_id, platform)
       values ('acc_wa_2','whatsapp')`
    )
    expect(insertError).not.toBeNull()

    const id = await seedAccount()
    await db.tryAs(TOMI, "update public.social_accounts set is_active = false where id = $1", [id])
    const [row] = await db.admin<{ is_active: boolean }>(
      "select is_active from public.social_accounts where id = $1",
      [id]
    )
    expect(row.is_active).toBe(true)
  })

  it("nadie borra cuentas desde la app", async () => {
    const id = await seedAccount()
    await db.tryAs(SANTIAGO, "delete from public.social_accounts where id = $1", [id])
    const rows = await db.admin("select id from public.social_accounts where id = $1", [id])
    expect(rows).toHaveLength(1)
  })

  it("no admite dos veces la misma cuenta de Zernio", async () => {
    await seedAccount()
    const error = await db.tryAs(
      SANTIAGO,
      `insert into public.social_accounts (zernio_account_id, platform)
       values ('acc_ig_1','instagram')`
    )
    expect(error).not.toBeNull()
  })

  it("rechaza una plataforma fuera del catálogo", async () => {
    // El cliente normaliza a 'other' justamente para no chocar con este check.
    const error = await db.tryAs(
      SANTIAGO,
      `insert into public.social_accounts (zernio_account_id, platform)
       values ('acc_x','pinterest')`
    )
    expect(error).not.toBeNull()
  })
})

describe("social_webhook_events", () => {
  async function seedEvent(eventId = "evt_1") {
    await db.admin(
      `insert into public.social_webhook_events (zernio_event_id, event_type, payload)
       values ($1,'message.received','{"message":{"text":"hola"}}'::jsonb)`,
      [eventId]
    )
  }

  it("el equipo puede auditar los eventos recibidos", async () => {
    await seedEvent()
    const rows = await db.as(SANTIAGO, "select id from public.social_webhook_events")
    expect(rows).toHaveLength(1)
  })

  it("un anónimo no lee mensajes de clientes", async () => {
    await seedEvent()
    const rows = await db.as(null, "select id from public.social_webhook_events")
    expect(rows).toHaveLength(0)
  })

  it("ni siquiera un admin escribe eventos desde la app", async () => {
    // Los eventos sólo entran por el endpoint del webhook, que en la fase 1 usa
    // una función SECURITY DEFINER. Nadie los fabrica desde la sesión.
    const error = await db.tryAs(
      SANTIAGO,
      `insert into public.social_webhook_events (zernio_event_id, event_type, payload)
       values ('evt_falso','message.received','{}'::jsonb)`
    )
    expect(error).not.toBeNull()
  })

  it("el mismo evento dos veces no se guarda dos veces", async () => {
    // Zernio entrega at-least-once: esta unicidad ES la deduplicación.
    await seedEvent("evt_repetido")
    await expect(seedEvent("evt_repetido")).rejects.toThrow()

    const rows = await db.admin(
      "select id from public.social_webhook_events where zernio_event_id = 'evt_repetido'"
    )
    expect(rows).toHaveLength(1)
  })
})

describe("social_sync_state", () => {
  it("el equipo ve cuándo se sincronizó por última vez", async () => {
    await db.admin(
      "insert into public.social_sync_state (sync_key, last_run_at) values ('accounts', now())"
    )
    const rows = await db.as(TOMI, "select sync_key from public.social_sync_state")
    expect(rows).toHaveLength(1)
  })

  it("sólo el admin registra una corrida", async () => {
    const adminError = await db.tryAs(
      SANTIAGO,
      "insert into public.social_sync_state (sync_key) values ('accounts')"
    )
    expect(adminError).toBeNull()

    const operadorError = await db.tryAs(
      TOMI,
      "insert into public.social_sync_state (sync_key) values ('stories')"
    )
    expect(operadorError).not.toBeNull()
  })

  it("un anónimo no ve el estado de las sincronizaciones", async () => {
    await db.admin("insert into public.social_sync_state (sync_key) values ('accounts')")
    const rows = await db.as(null, "select sync_key from public.social_sync_state")
    expect(rows).toHaveLength(0)
  })
})
