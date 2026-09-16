/**
 * Identidad de la sesión a partir de los claims del JWT.
 *
 * Módulo puro: no importa `server-only` ni Supabase, así se prueba con Vitest.
 * `getClaims()` ya verificó la firma (ES256, localmente) y el vencimiento; acá
 * sólo se decide si esos claims alcanzan para considerar a alguien logueado.
 */
export type SessionUser = {
  id: string
  email: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function sessionUserFromClaims(claims: unknown): SessionUser | null {
  if (typeof claims !== "object" || claims === null) return null
  const c = claims as Record<string, unknown>

  // `sub` es el id de `auth.users`. Sin un uuid válido no hay a quién buscarle
  // el perfil, y las políticas RLS comparan contra ese mismo valor.
  if (typeof c.sub !== "string" || !UUID.test(c.sub)) return null

  // Un token de la clave anon también es un JWT válido y firmado, pero no
  // representa a una persona: sólo `authenticated` cuenta como sesión.
  if (c.role !== "authenticated") return null

  return {
    id: c.sub,
    email: typeof c.email === "string" && c.email.length > 0 ? c.email : null,
  }
}
