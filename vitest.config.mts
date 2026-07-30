import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/supabase/types.ts"],
    },
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
      "@public": resolve(import.meta.dirname, "./public"),
      // `server-only` throws outside a React Server Component. Its job is to
      // fail the build if server code reaches a client bundle — not a
      // constraint these unit tests exercise.
      "server-only": resolve(import.meta.dirname, "./tests/stubs/empty.ts"),
    },
  },
});
