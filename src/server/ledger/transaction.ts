import type { Prisma } from "@/generated/prisma/client";
import type { Db } from "@/server/db";
import { LedgerError } from "./errors";

/**
 * Db doesn't tell the client from a transaction, but ledger writes need one:
 * outside it each statement commits on its own (a transaction without its
 * entries, an account without its need). The transaction client has no
 * $disconnect.
 */
export function assertTransaction(
  db: Db,
  operation: string,
): asserts db is Prisma.TransactionClient {
  if ("$disconnect" in db) {
    throw new LedgerError(
      "NOT_IN_TRANSACTION",
      `${operation}() must run inside db.$transaction()`,
    );
  }
}
