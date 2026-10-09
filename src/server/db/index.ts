import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/lib/env";
import { createPrismaClient } from "./client";

export type { Db } from "./client";

const globalForDb = globalThis as typeof globalThis & {
  shelterDb?: PrismaClient;
};

/**
 * The shared client of this server process. Created on first use, not on
 * import: `next build` imports route modules and has no DATABASE_URL. Kept on
 * globalThis, so dev reloads and separately bundled route modules reuse one
 * connection pool.
 */
export function getDb(): PrismaClient {
  globalForDb.shelterDb ??= createPrismaClient(getEnv().DATABASE_URL);
  return globalForDb.shelterDb;
}

/** Closes the shared pool (shutdown, tests); the next getDb() opens a new one. */
export async function disconnectDb(): Promise<void> {
  const db = globalForDb.shelterDb;
  globalForDb.shelterDb = undefined;
  await db?.$disconnect();
}
