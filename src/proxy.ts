import type { NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

// Next.js 16: convención "proxy" (reemplaza a middleware.ts).
export async function proxy(request: NextRequest) {
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
