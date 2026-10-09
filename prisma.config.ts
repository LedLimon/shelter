import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Prisma 7 doesn't read .env itself. Variables already set in the shell win.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Not env("DATABASE_URL"): it throws when the variable is unset, and
    // `prisma generate` (postinstall, Docker build) must work without a database.
    url: process.env.DATABASE_URL,
  },
});
