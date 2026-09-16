import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { sessionUserFromClaims } from "@/lib/session"
import type { Database } from "./types"

/**
 * Refresca la sesión de Supabase en cada request y protege las rutas internas.
 * Sin sesión válida -> redirige a /login (excepto /login y assets).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getClaims() también refresca la sesión si el token venció (lo que este
  // middleware existe para hacer) y verifica la firma ES256 localmente, sin el
  // viaje de red que costaba getUser() en cada request.
  const { data } = await supabase.auth.getClaims()
  const user = data ? sessionUserFromClaims(data.claims) : null

  const { pathname } = request.nextUrl
  /**
   * Endpoints que entran sin sesión porque los llama una máquina, no una
   * persona: cada uno valida su propia credencial (token compartido en
   * `/api/ingest`, firma HMAC en `/api/zernio`).
   *
   * Que esta lista quede corta no da un error visible, da algo peor: el
   * proveedor recibe un redirect a /login, lo sigue, obtiene un 200 con HTML y
   * da la entrega por buena. Los mensajes se pierden en silencio y no queda
   * rastro en ningún lado.
   */
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/ingest") ||
    pathname.startsWith("/api/zernio")

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  if (user && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
