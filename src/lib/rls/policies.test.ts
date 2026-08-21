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

let db: TestDb

beforeAll(async () => {
  db = await createTestDb()
  await seedIdentities(db)
}, 120_000)

beforeEach(async () => {
  await resetState(db)
})

afterAll(async () => {
  await db?.close()
})

async function roleOf(userId: string): Promise<string> {
  const rows = await db.admin<{ role: string }>(
    "select role from public.profiles where id = $1",
    [userId]
  )
  return rows[0]?.role
}

describe("profiles: escalada de privilegios", () => {
  it("un operador no puede convertirse en admin", async () => {
    const error = await db.tryAs(
      TOMI,
      "update public.profiles set role = 'admin' where id = $1",
      [TOMI]
    )
    // Da igual si Postgres lo rechaza con error o si la política no deja
    // tocar la fila: lo que no puede pasar es que el rol termine en admin.
    expect(await roleOf(TOMI)).toBe("operador")
    expect(error === null ? "sin error" : error.code).not.toBe("sin error")
  })

  it("un operador no puede ascender a otra persona", async () => {
    await db.tryAs(
      TOMI,
      "update public.profiles set role = 'admin' where id = $1",
      [SANTIAGO]
    )
    expect(await roleOf(SANTIAGO)).toBe("admin")

    await db.tryAs(
      TOMI,
      "update public.profiles set role = 'operador' where id = $1",
      [SANTIAGO]
    )
    expect(await roleOf(SANTIAGO)).toBe("admin")
  })

  it("nadie puede borrar perfiles", async () => {
    await db.tryAs(SANTIAGO, "delete from public.profiles where id = $1", [TOMI])
    const rows = await db.admin("select id from public.profiles where id = $1", [
      TOMI,
    ])
    expect(rows).toHaveLength(1)
  })
})

describe("membresía: quién entra al CRM", () => {
  it("un autenticado sin perfil no lee proyectos", async () => {
    const rows = await db.as(EXTRANO, "select id from public.projects")
    expect(rows).toHaveLength(0)
  })

  it("un autenticado sin perfil no crea proyectos", async () => {
    const error = await db.tryAs(
      EXTRANO,
      `insert into public.projects (name, type, engagement_kind)
       values ('intruso','landing_page','internal')`
    )
    expect(error).not.toBeNull()
  })

  it("un anónimo no lee nada", async () => {
    const rows = await db.as(null, "select id from public.projects")
    expect(rows).toHaveLength(0)
  })
})

describe("borrado de registros centrales", () => {
  it("un miembro no puede borrar un proyecto", async () => {
    const [project] = await db.admin<{ id: string }>(
      `insert into public.projects (name, type, engagement_kind)
       values ('Proyecto real','landing_page','internal') returning id`
    )
    await db.tryAs(TOMI, "delete from public.projects where id = $1", [
      project.id,
    ])
    const rows = await db.admin("select id from public.projects where id = $1", [
      project.id,
    ])
    expect(rows).toHaveLength(1)
  })
})

describe("lo que debe seguir funcionando", () => {
  it("un miembro lee y escribe proyectos y tareas", async () => {
    const [project] = await db.as<{ id: string }>(
      TOMI,
      `insert into public.projects (name, type, engagement_kind)
       values ('Landing Nueva','landing_page','internal') returning id`
    )
    expect(project.id).toBeTruthy()

    const [task] = await db.as<{ id: string }>(
      TOMI,
      `insert into public.project_tasks (project_id, title) values ($1,'Brief')
       returning id`,
      [project.id]
    )
    expect(task.id).toBeTruthy()

    const visible = await db.as(SANTIAGO, "select id from public.projects where id = $1", [
      project.id,
    ])
    expect(visible).toHaveLength(1)
  })

  it("un miembro puede editar su propio nombre", async () => {
    const error = await db.tryAs(
      TOMI,
      "update public.profiles set full_name = 'Tomás' where id = $1",
      [TOMI]
    )
    expect(error).toBeNull()
    const rows = await db.admin<{ full_name: string }>(
      "select full_name from public.profiles where id = $1",
      [TOMI]
    )
    expect(rows[0].full_name).toBe("Tomás")
  })

  it("un admin sí puede cambiar roles", async () => {
    await db.as(SANTIAGO, "update public.profiles set role = 'admin' where id = $1", [
      TOMI,
    ])
    expect(await roleOf(TOMI)).toBe("admin")
  })

  it("un miembro puede borrar un contacto", async () => {
    const [contact] = await db.admin<{ id: string }>(
      `insert into public.contacts (full_name) values ('Contacto') returning id`
    )
    const error = await db.tryAs(TOMI, "delete from public.contacts where id = $1", [
      contact.id,
    ])
    expect(error).toBeNull()
  })
})

describe("colaboración: no romper lo que ya funcionaba", () => {
  async function proyectoDePrueba(): Promise<string> {
    const [p] = await db.admin<{ id: string }>(
      `insert into public.projects (name, type, engagement_kind)
       values ('Colaborativo','landing_page','internal') returning id`
    )
    return p.id
  }

  it("reasignar colaboradores sigue funcionando (borrar y reinsertar)", async () => {
    const projectId = await proyectoDePrueba()
    await db.as(
      SANTIAGO,
      `insert into public.project_collaborators (project_id, profile_id)
       values ($1,$2)`,
      [projectId, TOMI]
    )
    // La UI limpia y vuelve a insertar; ese DELETE debe seguir permitido.
    const error = await db.tryAs(
      SANTIAGO,
      "delete from public.project_collaborators where project_id = $1",
      [projectId]
    )
    expect(error).toBeNull()
  })

  it("un miembro registra hitos y bloqueos", async () => {
    const projectId = await proyectoDePrueba()
    const hito = await db.tryAs(
      TOMI,
      `insert into public.project_milestones (project_id, title) values ($1,'Entrega')`,
      [projectId]
    )
    expect(hito).toBeNull()

    const bloqueo = await db.tryAs(
      TOMI,
      `insert into public.project_blockers (project_id, title) values ($1,'Falta material')`,
      [projectId]
    )
    expect(bloqueo).toBeNull()
  })

  it("un miembro puede avanzar una oportunidad y su cliente", async () => {
    const [org] = await db.admin<{ id: string }>(
      `insert into public.organizations (name) values ('ACME') returning id`
    )
    const oportunidad = await db.tryAs(
      TOMI,
      `insert into public.opportunities (title, organization_id) values ('Landing ACME',$1)`,
      [org.id]
    )
    expect(oportunidad).toBeNull()

    const cliente = await db.tryAs(
      TOMI,
      `insert into public.clients (organization_id) values ($1)`,
      [org.id]
    )
    expect(cliente).toBeNull()
  })

  it("un miembro registra actividad y queda auditado", async () => {
    const actividad = await db.tryAs(
      TOMI,
      `insert into public.activities (type, body) values ('nota','Llamé al cliente')`
    )
    expect(actividad).toBeNull()

    const auditoria = await db.tryAs(
      TOMI,
      `insert into public.audit_log (user_id, entity, action) values ($1,'project','updated')`,
      [TOMI]
    )
    expect(auditoria).toBeNull()
  })

  it("nadie puede falsear el autor de una entrada de auditoría", async () => {
    const error = await db.tryAs(
      TOMI,
      `insert into public.audit_log (user_id, entity, action) values ($1,'project','updated')`,
      [SANTIAGO]
    )
    expect(error).not.toBeNull()
  })
})
