import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest"
import {
  createTestDb,
  seedIdentities,
  SANTIAGO,
  TOMI,
  EXTRANO,
  type TestDb,
} from "@/lib/rls/harness"

/**
 * Aislamiento de Operon IA: la propiedad que sostiene todo el producto es que
 * la conversación de una persona no existe para la otra. Se prueba contra
 * Postgres real, con las políticas verdaderas.
 */

let db: TestDb

beforeAll(async () => {
  db = await createTestDb()
  await seedIdentities(db)
}, 120_000)

beforeEach(async () => {
  await db.admin("delete from public.assistant_messages")
  await db.admin("delete from public.assistant_conversations")
  await db.admin("delete from public.assistant_profiles")
})

afterAll(async () => {
  await db?.close()
})

/** Crea una conversación como `owner` y devuelve su id. */
async function conversacionDe(owner: string, titulo = "Charla"): Promise<string> {
  const [row] = await db.as<{ id: string }>(
    owner,
    `insert into public.assistant_conversations (owner_user_id, title)
     values ($1, $2) returning id`,
    [owner, titulo]
  )
  return row.id
}

describe("perfiles del asistente", () => {
  it("cada persona crea y lee el suyo", async () => {
    const error = await db.tryAs(
      SANTIAGO,
      `insert into public.assistant_profiles (user_id, display_name)
       values ($1, 'JARVIS')`,
      [SANTIAGO]
    )
    expect(error).toBeNull()

    const propio = await db.as(
      SANTIAGO,
      "select display_name from public.assistant_profiles"
    )
    expect(propio).toHaveLength(1)
  })

  it("nadie ve el perfil de otra persona", async () => {
    await db.as(
      SANTIAGO,
      `insert into public.assistant_profiles (user_id, display_name)
       values ($1, 'JARVIS')`,
      [SANTIAGO]
    )
    const desdeTomi = await db.as(
      TOMI,
      "select display_name from public.assistant_profiles"
    )
    expect(desdeTomi).toHaveLength(0)
  })

  it("nadie crea un perfil a nombre de otra persona", async () => {
    const error = await db.tryAs(
      TOMI,
      `insert into public.assistant_profiles (user_id, display_name)
       values ($1, 'Impostor')`,
      [SANTIAGO]
    )
    expect(error).not.toBeNull()
  })

  it("una persona no puede tener dos perfiles", async () => {
    await db.as(
      SANTIAGO,
      `insert into public.assistant_profiles (user_id, display_name)
       values ($1, 'JARVIS')`,
      [SANTIAGO]
    )
    const error = await db.tryAs(
      SANTIAGO,
      `insert into public.assistant_profiles (user_id, display_name)
       values ($1, 'Otro')`,
      [SANTIAGO]
    )
    expect(error).not.toBeNull()
  })

  it("no se puede mudar un perfil a otra identidad", async () => {
    await db.as(
      SANTIAGO,
      `insert into public.assistant_profiles (user_id, display_name)
       values ($1, 'JARVIS')`,
      [SANTIAGO]
    )
    await db.tryAs(
      SANTIAGO,
      "update public.assistant_profiles set user_id = $1",
      [TOMI]
    )
    const deTomi = await db.admin(
      "select user_id from public.assistant_profiles where user_id = $1",
      [TOMI]
    )
    expect(deTomi).toHaveLength(0)
  })

  it("las preferencias sólo aceptan valores del catálogo", async () => {
    const error = await db.tryAs(
      SANTIAGO,
      `insert into public.assistant_profiles (user_id, display_name, tone)
       values ($1, 'JARVIS', 'sarcastico_extremo')`,
      [SANTIAGO]
    )
    expect(error).not.toBeNull()
  })
})

describe("conversaciones privadas", () => {
  it("cada persona ve sólo las suyas", async () => {
    await conversacionDe(SANTIAGO, "Mía")
    await conversacionDe(TOMI, "De Tomi")

    const deSantiago = await db.as<{ title: string }>(
      SANTIAGO,
      "select title from public.assistant_conversations"
    )
    expect(deSantiago.map((c) => c.title)).toEqual(["Mía"])

    const deTomi = await db.as<{ title: string }>(
      TOMI,
      "select title from public.assistant_conversations"
    )
    expect(deTomi.map((c) => c.title)).toEqual(["De Tomi"])
  })

  it("no se puede crear una conversación a nombre de otra persona", async () => {
    const error = await db.tryAs(
      TOMI,
      `insert into public.assistant_conversations (owner_user_id, title)
       values ($1, 'Robada')`,
      [SANTIAGO]
    )
    expect(error).not.toBeNull()
  })

  it("no se puede transferir una conversación a otra persona", async () => {
    const id = await conversacionDe(SANTIAGO)
    await db.tryAs(
      SANTIAGO,
      "update public.assistant_conversations set owner_user_id = $1 where id = $2",
      [TOMI, id]
    )
    const vistaPorTomi = await db.as(
      TOMI,
      "select id from public.assistant_conversations where id = $1",
      [id]
    )
    expect(vistaPorTomi).toHaveLength(0)
  })

  it("un extraño sin perfil interno no ve nada", async () => {
    await conversacionDe(SANTIAGO)
    const rows = await db.as(
      EXTRANO,
      "select id from public.assistant_conversations"
    )
    expect(rows).toHaveLength(0)
  })

  it("un anónimo no ve nada", async () => {
    await conversacionDe(SANTIAGO)
    const rows = await db.as(null, "select id from public.assistant_conversations")
    expect(rows).toHaveLength(0)
  })

  it("cada quien puede archivar y borrar la suya", async () => {
    const id = await conversacionDe(SANTIAGO)
    const archivar = await db.tryAs(
      SANTIAGO,
      "update public.assistant_conversations set archived_at = now() where id = $1",
      [id]
    )
    expect(archivar).toBeNull()

    const borrar = await db.tryAs(
      SANTIAGO,
      "delete from public.assistant_conversations where id = $1",
      [id]
    )
    expect(borrar).toBeNull()
  })

  it("nadie puede borrar la conversación de otra persona", async () => {
    const id = await conversacionDe(SANTIAGO)
    await db.tryAs(
      TOMI,
      "delete from public.assistant_conversations where id = $1",
      [id]
    )
    const sigue = await db.admin(
      "select id from public.assistant_conversations where id = $1",
      [id]
    )
    expect(sigue).toHaveLength(1)
  })
})

describe("mensajes", () => {
  it("se escriben y se leen dentro de la propia conversación", async () => {
    const id = await conversacionDe(SANTIAGO)
    const error = await db.tryAs(
      SANTIAGO,
      `insert into public.assistant_messages (conversation_id, role, content)
       values ($1, 'user', 'Hola')`,
      [id]
    )
    expect(error).toBeNull()

    const leidos = await db.as(
      SANTIAGO,
      "select content from public.assistant_messages where conversation_id = $1",
      [id]
    )
    expect(leidos).toHaveLength(1)
  })

  it("nadie lee los mensajes de una conversación ajena", async () => {
    const id = await conversacionDe(SANTIAGO)
    await db.as(
      SANTIAGO,
      `insert into public.assistant_messages (conversation_id, role, content)
       values ($1, 'user', 'Secreto')`,
      [id]
    )
    const deTomi = await db.as(
      TOMI,
      "select content from public.assistant_messages"
    )
    expect(deTomi).toHaveLength(0)
  })

  it("nadie escribe en una conversación ajena", async () => {
    const id = await conversacionDe(SANTIAGO)
    const error = await db.tryAs(
      TOMI,
      `insert into public.assistant_messages (conversation_id, role, content)
       values ($1, 'user', 'Metido')`,
      [id]
    )
    expect(error).not.toBeNull()
  })

  it("el rol sólo acepta valores conocidos", async () => {
    const id = await conversacionDe(SANTIAGO)
    const error = await db.tryAs(
      SANTIAGO,
      `insert into public.assistant_messages (conversation_id, role, content)
       values ($1, 'root', 'Escalada')`,
      [id]
    )
    expect(error).not.toBeNull()
  })

  it("borrar la conversación se lleva sus mensajes", async () => {
    const id = await conversacionDe(SANTIAGO)
    await db.as(
      SANTIAGO,
      `insert into public.assistant_messages (conversation_id, role, content)
       values ($1, 'user', 'Hola')`,
      [id]
    )
    await db.as(
      SANTIAGO,
      "delete from public.assistant_conversations where id = $1",
      [id]
    )
    const huerfanos = await db.admin(
      "select id from public.assistant_messages where conversation_id = $1",
      [id]
    )
    expect(huerfanos).toHaveLength(0)
  })
})
