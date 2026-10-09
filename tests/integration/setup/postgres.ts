// Global setup of the integration project: one Postgres container per run,
// migrations applied once to a template database. Each test file then gets
// its own copy of it (./database.ts).
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

// Same as docker-compose.yml.
const IMAGE = "postgres:16.15-alpine";
const TEMPLATE_DATABASE = "shelter_template";

declare module "vitest" {
  export interface ProvidedContext {
    /** URL of the migrated template database. */
    templateDatabaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer(IMAGE)
    .withDatabase(TEMPLATE_DATABASE)
    .withUsername("shelter")
    .withPassword("shelter")
    // Throwaway data: keep it in memory and skip durability work.
    .withTmpFs({ "/var/lib/postgresql/data": "rw" })
    .withCommand([
      "postgres",
      ...["-c", "fsync=off"],
      ...["-c", "synchronous_commit=off"],
      ...["-c", "full_page_writes=off"],
    ])
    .start()
    .catch((error: unknown) => {
      throw new Error(
        "Integration tests start Postgres in Docker: is Docker running? " +
          "Unit tests alone: pnpm test:unit.",
        { cause: error },
      );
    });

  try {
    migrate(container.getConnectionUri());
  } catch (error) {
    await container.stop();
    throw error;
  }

  project.provide("templateDatabaseUrl", container.getConnectionUri());

  return async () => {
    await container.stop();
  };
}

/** `prisma migrate deploy`: the same migrations, the same way as in deployments. */
function migrate(databaseUrl: string) {
  const require = createRequire(import.meta.url);
  const cli = path.join(
    path.dirname(require.resolve("prisma/package.json")),
    "build/index.js",
  );
  try {
    execFileSync(process.execPath, [cli, "migrate", "deploy"], {
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        PRISMA_HIDE_UPDATE_MESSAGE: "1",
      },
      stdio: "pipe",
    });
  } catch (error) {
    const { stdout, stderr } = error as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `prisma migrate deploy failed:\n${String(stdout ?? "")}${String(stderr ?? "")}`,
      { cause: error },
    );
  }
}
