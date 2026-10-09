import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const path = (relative: string) =>
  fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path("./src"),
      "server-only": path("./tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.{ts,tsx}"],
        },
      },
      {
        // Real Postgres in Docker (Testcontainers): docs/testing.md#интеграционные-тесты
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/setup/postgres.ts"],
          setupFiles: ["tests/integration/setup/database.ts"],
          // A fresh process per file: the setup points DATABASE_URL at the
          // file's database, and getEnv()/getDb() cache it per process.
          isolate: true,
          // Concurrency tests on slow CI runners.
          testTimeout: 30_000,
        },
      },
    ],
  },
});
