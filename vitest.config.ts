import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.{test,spec}.{ts,tsx}", "src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next", "tests/e2e/**"],
    globals: false,
    // Integration suites share a single Postgres instance; running test files
    // in parallel races on DELETE / FK constraints. Serialize them.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.d.ts", "src/app/**/page.tsx", "src/app/**/layout.tsx"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // The `server-only` package is a Next.js bundler convention that throws
      // when reached from a client bundle. In Vitest (Node), we want to
      // import server modules directly, so we alias it to a no-op.
      "server-only": path.resolve(__dirname, "./tests/shims/server-only.ts"),
    },
  },
});
