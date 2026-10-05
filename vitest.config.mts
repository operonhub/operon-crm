import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

// El alias replica tsconfig. También se prueban componentes SSR con datos y
// sesión sintéticos, sin conectar la aplicación a la base remota.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
})
