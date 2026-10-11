// Runs before every integration test file: the file gets its own database,
// a copy of the migrated template (./postgres.ts), dropped after the file.
// Tests use it through getDb() from @/server/db, like the app does.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { afterAll, inject } from "vitest";
import { disconnectDb } from "@/server/db";
import { createPrismaClient } from "@/server/db/client";

const templateUrl = new URL(inject("templateDatabaseUrl"));
const template = templateUrl.pathname.slice(1);
const database = `test_${randomBytes(6).toString("hex")}`;

function urlOf(name: string): string {
  const url = new URL(templateUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

async function asAdmin(sql: string): Promise<void> {
  const admin = createPrismaClient(urlOf("postgres"));
  try {
    await admin.$executeRawUnsafe(sql);
  } finally {
    await admin.$disconnect();
  }
}

await asAdmin(`CREATE DATABASE "${database}" TEMPLATE "${template}"`);

// getEnv() checks every server variable. Take them from .env.example, so
// tests depend neither on the shell nor on a local .env.
const example = parseEnv(
  readFileSync(new URL("../../../.env.example", import.meta.url), "utf8"),
);
// Secrets are empty there; this one is a fixed value for tests only.
Object.assign(process.env, example, {
  DATABASE_URL: urlOf(database),
  BETTER_AUTH_SECRET: "integration-tests-only-0123456789abcdef",
});

afterAll(async () => {
  await disconnectDb();
  await asAdmin(`DROP DATABASE "${database}" WITH (FORCE)`);
});
