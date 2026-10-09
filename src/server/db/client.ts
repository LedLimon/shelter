// eslint-disable-next-line no-restricted-imports -- the one place clients are made
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";

/**
 * The client or the `tx` of `db.$transaction(async (tx) => …)`. Domain
 * functions take it as a parameter, so a caller can run several of them in
 * one transaction.
 */
export type Db = PrismaClient | Prisma.TransactionClient;

/**
 * A new client with its own connection pool. The app (and integration tests)
 * share one through getDb() from `@/server/db`; this is for code that can't
 * import `server-only` modules, like the seed, or needs another database.
 * Every client is made here: its sessions are pinned to UTC (withUtcSession()).
 */
export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: withUtcSession(connectionString),
    }),
  });
}

/**
 * The connection string with `-c TimeZone=UTC` added to its startup options.
 * adapter-pg sends Date parameters without an offset and reads timestamptz
 * with the offset replaced by +00:00, so in a session of another zone every
 * time would silently shift (docs/architecture.md#соглашения-схемы).
 *
 * It goes into the URL, not PoolConfig.options: node-postgres lets the URL's
 * `options` override the config's. Options already in the URL stay, and of
 * repeated -c settings Postgres applies the last. PGOPTIONS no longer applies
 * (node-postgres reads it only when there are no options): put them in the URL.
 */
export function withUtcSession(connectionString: string): string {
  let url: URL;
  try {
    // A bare % is a literal one, as node-postgres reads it. Left as it is, it
    // makes node-postgres re-encode the whole URL, %3D below included.
    url = new URL(connectionString.replace(/%(?![0-9a-f]{2})/gi, "%25"));
  } catch {
    // Not the URL itself (error.input): it holds the password.
    throw new TypeError("The database connection string is not a valid URL");
  }
  // The last one, as node-postgres takes it; set() drops the rest.
  const options = url.searchParams.getAll("options").at(-1);
  url.searchParams.set(
    "options",
    options ? `${options} -c TimeZone=UTC` : "-c TimeZone=UTC",
  );
  return url.href;
}
