import "server-only"

import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import type { Database, Tables } from "@/lib/supabase/types"
import type { SupabaseClient } from "@supabase/supabase-js"

export class AuthorizationError extends Error {
  constructor(message: string, readonly status: 401 | 403 = 401) {
    super(message)
    this.name = "AuthorizationError"
  }
}

export type ActorContext = {
  supabase: SupabaseClient<Database>
  user: User
}

export type MemberContext = ActorContext & {
  profile: Tables<"profiles">
}

/** Verifica una sesión real con Supabase Auth. */
export async function requireActor(): Promise<ActorContext> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) {
    throw new AuthorizationError("Tu sesión venció. Volvé a iniciar sesión.")
  }
  return { supabase, user }
}

/** Exige que la sesión corresponda a un perfil interno activo. */
export async function requireMember(): Promise<MemberContext> {
  const actor = await requireActor()
  const { data: profile, error } = await actor.supabase
    .from("profiles")
    .select("*")
    .eq("id", actor.user.id)
    .single()
  if (error || !profile) {
    throw new AuthorizationError("No tenés acceso al equipo de Operon.", 403)
  }
  return { ...actor, profile }
}

/** Finanzas, configuración/aprobación de agentes, roles y archivado. */
export async function requireAdmin(): Promise<MemberContext> {
  const member = await requireMember()
  if (member.profile.role !== "admin") {
    throw new AuthorizationError(
      "Esta acción requiere permisos de Fundador/admin.",
      403
    )
  }
  return member
}

export function authorizationMessage(error: unknown): string {
  if (error instanceof AuthorizationError) return error.message
  return "No se pudo verificar tu acceso. Intentá de nuevo."
}
