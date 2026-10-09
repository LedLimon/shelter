import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";

/**
 * The client or the `tx` of `db.$transaction(async (tx) => …)`. Domain
 * functions take it as a parameter, so a caller can run several of them in
 * one transaction.
 */
export type Db = PrismaClient | Prisma.TransactionClient;

/**
 * A new client with its own connection pool. The app shares one through
 * getDb() from `@/server/db`; this is for code outside Next.js: the seed,
 * integration tests and the worker.
 */
export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
