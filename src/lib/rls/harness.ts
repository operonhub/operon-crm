/**
 * Banco de pruebas de RLS: levanta un Postgres embebido (PGlite), simula el
 * entorno de Supabase (roles `anon`/`authenticated`, esquema `auth`, y
 * `auth.uid()` leyendo el JWT igual que en producción) y aplica las
 * migraciones reales del repositorio.
 *
 * Sirve para probar las políticas de verdad, sin Docker y sin tocar la base
 * remota. Es código de test: no lo importa la aplicación.
 */
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { PGlite } from "@electric-sql/pglite"

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations")

/**
 * PGlite no incluye pgcrypto y no lo necesita: `gen_random_uuid()` es nativo
 * desde Postgres 13 y las migraciones no usan nada más de esa extensión.
 */
function stripUnsupported(sql: string): string {
  return sql.replace(
    /create\s+extension\s+if\s+not\s+exists\s+"?pgcrypto"?\s*;/gi,
    "-- pgcrypto omitido en PGlite"
  )
}

/** Reproduce lo que Supabase provee antes de correr cualquier migración. */
const BOOTSTRAP = `
  create role anon;
  create role authenticated;
  create role service_role;
  -- Rol con el que PostgREST se conecta en Supabase.
  create role authenticator noinherit;

  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    raw_app_meta_data jsonb not null default '{}'::jsonb
  );

  -- Misma implementación que usa Supabase: lee el claim 'sub' del JWT.
  create function auth.uid() returns uuid
  language sql stable
  as $$
    select nullif(
      nullif(current_setting('request.jwt.claims', true), '')::json->>'sub',
      ''
    )::uuid
  $$;

  grant usage on schema auth to anon, authenticated, service_role;
  grant select on auth.users to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
`

export type TestDb = {
  /** Consulta como superusuario: ignora RLS. Para preparar datos y verificar. */
  admin<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
  /** Consulta con la identidad de un usuario: RLS activa, igual que el navegador. */
  as<T = Record<string, unknown>>(
    userId: string | null,
    sql: string,
    params?: unknown[]
  ): Promise<T[]>
  /** Ejecuta y devuelve el error de Postgres si lo hubo, o null si pasó. */
  tryAs(
    userId: string | null,
    sql: string,
    params?: unknown[]
  ): Promise<{ code: string; message: string } | null>
  close(): Promise<void>
}

export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite()
  await db.exec(BOOTSTRAP)

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort()

  for (const file of files) {
    const sql = stripUnsupported(
      await readFile(path.join(MIGRATIONS_DIR, file), "utf8")
    )
    try {
      await db.exec(sql)
    } catch (error) {
      throw new Error(
        `Falló la migración ${file}: ${(error as Error).message}`
      )
    }
  }

  /**
   * Supabase concede DML completo sobre `public` a anon/authenticated por
   * privilegios por defecto (verificado contra la base real). Lo replicamos
   * para que lo único que restrinja el acceso en las pruebas sea la RLS, y no
   * un GRANT ausente que nos daría un falso positivo.
   */
  await db.exec(`
    grant all on all tables in schema public to anon, authenticated, service_role;
    grant all on all sequences in schema public to anon, authenticated, service_role;
    grant all on all functions in schema public to anon, authenticated, service_role;
  `)

  async function admin<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await db.query<T>(sql, params)
    return result.rows
  }

  /**
   * `set local` dentro de una transacción: el rol y el JWT se revierten solos
   * al cerrar, así una prueba no contamina a la siguiente.
   */
  async function as<T>(
    userId: string | null,
    sql: string,
    params: unknown[] = []
  ): Promise<T[]> {
    const claims = userId ? JSON.stringify({ sub: userId }) : "{}"
    const role = userId ? "authenticated" : "anon"
    await db.exec("begin")
    try {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims])
      await db.exec(`set local role ${role}`)
      const result = await db.query<T>(sql, params)
      await db.exec("commit")
      return result.rows
    } catch (error) {
      await db.exec("rollback")
      throw error
    }
  }

  async function tryAs(
    userId: string | null,
    sql: string,
    params: unknown[] = []
  ) {
    try {
      await as(userId, sql, params)
      return null
    } catch (error) {
      const e = error as { code?: string; message?: string }
      return { code: e.code ?? "unknown", message: e.message ?? String(error) }
    }
  }

  return { admin, as, tryAs, close: () => db.close() }
}

/** Identidades fijas para las pruebas. */
export const SANTIAGO = "11111111-1111-1111-1111-111111111111"
export const TOMI = "22222222-2222-2222-2222-222222222222"
export const EXTRANO = "33333333-3333-3333-3333-333333333333"

/**
 * Devuelve la base al estado inicial entre pruebas: sin esto, un test que
 * demuestra la escalada de privilegios deja el rol cambiado y contamina a los
 * siguientes.
 */
export async function resetState(db: TestDb) {
  await db.admin("delete from public.project_tasks")
  await db.admin("delete from public.projects")
  await db.admin("delete from public.contacts")
  // `session_replication_role = replica` suspende los triggers de usuario sólo
  // en esta sesión: es la forma estándar de preparar datos sin desactivar la
  // protección real contra escalada de privilegios.
  await db.admin("set session_replication_role = replica")
  try {
    // `handle_new_user` le crea perfil a toda cuenta de auth.users, así que
    // para simular a alguien ajeno al equipo hay que quitárselo.
    await db.admin("delete from public.profiles where id = $1", [EXTRANO])
    await db.admin(
      `insert into public.profiles (id, full_name, email, role) values
         ($1,'Santiago','santiago@operon.dev','admin'),
         ($2,'Tomi','tomi@operon.dev','operador')
       on conflict (id) do update
         set full_name = excluded.full_name, role = excluded.role`,
      [SANTIAGO, TOMI]
    )
  } finally {
    await db.admin("set session_replication_role = default")
  }
}

/** Crea las cuentas de prueba: un admin, un operador y un intruso sin perfil. */
export async function seedIdentities(db: TestDb) {
  await db.admin(
    `insert into auth.users (id, email) values
       ($1,'santiago@operon.dev'), ($2,'tomi@operon.dev'), ($3,'ajeno@example.com')`,
    [SANTIAGO, TOMI, EXTRANO]
  )
  // El trigger handle_new_user ya creó los profiles al insertar en
  // auth.users; resetState fija los roles que necesitan las pruebas.
  await resetState(db)
}
