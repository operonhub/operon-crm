import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

// Los tests corren sobre lógica pura de `src/lib`. El alias replica el de
// tsconfig para que los módulos puedan importarse igual que en la app.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
})
