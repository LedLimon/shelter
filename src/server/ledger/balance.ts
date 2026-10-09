import { Prisma } from "@/generated/prisma/client";
import type { Db } from "@/server/db";
import { LedgerError } from "./errors";

/**
 * The account's balance in kopecks: the sum of its entries — of those posted
 * before `at` if given (half-open, so balance(id, periodEnd) is the balance at
 * the end of a period). Positive on fund and need accounts; source accounts
 * (DONATIONS_IN, IN_KIND_IN) go negative.
 */
export async function balance(
  db: Db,
  accountId: string,
  at?: Date,
): Promise<number> {
  if (at && Number.isNaN(at.getTime())) {
    throw new LedgerError(
      "INVALID_INPUT",
      "balance(): `at` is an invalid date",
    );
  }

  // SUM of integer is bigint: totals may exceed the Int range of one amount.
  const [row] = await db.$queryRaw<{ balanceKop: bigint }[]>`
    SELECT COALESCE(SUM(e."amountKop"), 0)::bigint AS "balanceKop"
      FROM "LedgerAccount" a
      LEFT JOIN "LedgerEntry" e
        ON e."accountId" = a."id"
       ${at ? Prisma.sql`AND e."postedAt" < ${at}` : Prisma.empty}
     WHERE a."id" = ${accountId}
     GROUP BY a."id"`;
  if (!row) {
    throw new LedgerError("UNKNOWN_ACCOUNT", `unknown account ${accountId}`);
  }

  const kop = Number(row.balanceKop);
  if (!Number.isSafeInteger(kop)) {
    throw new LedgerError(
      "INVALID_INPUT",
      `balance of ${accountId} is beyond the safe integer range`,
    );
  }
  return kop;
}
