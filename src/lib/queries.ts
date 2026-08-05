import { createClient } from "@/lib/supabase/server"

/** Miembros internos (para selects de responsable). */
export async function getProfiles() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .order("full_name")
  return data ?? []
}

/** Organizaciones (para selects). */
export async function getOrganizations() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("organizations")
    .select("id, name, domain")
    .order("name")
  return data ?? []
}
