"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export async function login(_prevState: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")

  if (!email || !password) {
    return { error: "Completá email y contraseña." }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    const connectionFailure =
      error.name === "AuthRetryableFetchError" ||
      /fetch failed|failed to fetch|enotfound|network/i.test(error.message)

    if (connectionFailure) {
      return {
        error:
          "No se pudo conectar con Supabase. Revisá la configuración del proyecto.",
      }
    }

    return { error: "Credenciales inválidas." }
  }

  redirect("/")
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
