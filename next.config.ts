import type { NextConfig } from "next";

/**
 * `turbopack.root` no se fija a mano a propósito.
 *
 * Estaba puesto en `process.cwd()`, que en Windows hace que Turbopack termine
 * uniendo la ruta absoluta sobre sí misma y escriba el build en
 * `<repo>/Desktop/Claude Code/<repo>/.next`. Ese directorio fantasma queda
 * fuera del ignore de ESLint (que sólo cubre `.next/**` en la raíz), así que
 * `npm run lint` pasaba a reportar miles de problemas en bundles generados
 * apenas alguien levantaba el dev server.
 *
 * Por defecto Turbopack usa el directorio de este archivo, que es lo correcto.
 */
const nextConfig: NextConfig = {};

export default nextConfig;
