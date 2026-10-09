// Global setup of the integration project: one Postgres container per run,
// migrations applied once to a template database. Each test file then gets
// its own copy of it (./database.ts).
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
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
    // Throwaway data: keep it in memory and skip durability work. This
    // doesn't change locking, isolation or triggers.
    .withTmpFs({ "/var/lib/postgresql/data": "rw" })
    .withCommand([
      "postgres",
      ...["-c", "fsync=off"],
      ...["-c", "synchronous_commit=off"],
      ...["-c", "full_page_writes=off"],
      // Test files run in parallel, and concurrency tests open whole pools.
      ...["-c", "max_connections=300"],
      // Not UTC, like a server whose initdb took the system zone: a client
      // that doesn't pin its sessions to UTC shifts times (timezone.test.ts).
      ...["-c", "timezone=Europe/Moscow"],
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
    await prepareTemplate(container);
  } catch (error) {
    await container.stop();
    throw error;
  }

  project.provide("templateDatabaseUrl", container.getConnectionUri());

  return async () => {
    await container.stop();
  };
}

async function prepareTemplate(container: StartedPostgreSqlContainer) {
  const url = container.getConnectionUri();

  // The same migrations, applied the same way as in deployments.
  prisma(url, ["migrate", "deploy"]);

  // schema.prisma edited without a migration: the client would expect what
  // the database doesn't have (a missing @unique lets duplicates through).
  const diff = prisma(url, [
    ...["migrate", "diff", "--exit-code", "--script"],
    ...["--from-config-datasource", "--to-schema", "prisma/schema.prisma"],
  ]);
  if (diff.status === 2) {
    throw new Error(
      "prisma/schema.prisma has changes without a migration; " +
        `create one with pnpm db:migrate --name <name>:\n${diff.output}`,
    );
  }

  // CREATE DATABASE … TEMPLATE waits for, then fails on, sessions connected
  // to the template. Nothing needs to connect to it from now on.
  const alter = await container.exec([
    ...["psql", "-U", "shelter", "-d", "postgres", "-c"],
    `ALTER DATABASE "${TEMPLATE_DATABASE}" WITH ALLOW_CONNECTIONS false`,
  ]);
  if (alter.exitCode !== 0) {
    throw new Error(`Couldn't close the template database:\n${alter.output}`);
  }
}

/** Runs the Prisma CLI; throws on failure, except for `diff --exit-code`'s 2. */
function prisma(databaseUrl: string, args: string[]) {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve("prisma/package.json");
  const { bin } = require(pkgPath) as { bin: { prisma: string } };

  const result = spawnSync(
    process.execPath,
    [path.join(path.dirname(pkgPath), bin.prisma), ...args],
    {
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        PRISMA_HIDE_UPDATE_MESSAGE: "1",
      },
      encoding: "utf8",
    },
  );
  const output = `${result.stdout}${result.stderr}`;
  if (result.status !== 0 && result.status !== 2) {
    throw new Error(`prisma ${args.join(" ")} failed:\n${output}`, {
      cause: result.error,
    });
  }
  return { status: result.status, output };
}
