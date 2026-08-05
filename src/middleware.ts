import type { NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

// Convención `middleware` (estable en Next 16). Refresca sesión y protege rutas.
export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Todas las rutas excepto:
     * - _next/static, _next/image, favicon
     * - archivos de imagen
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
