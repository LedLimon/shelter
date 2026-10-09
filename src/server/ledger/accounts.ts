import type { LedgerAccountKind } from "@/generated/prisma/enums";
import type { Db } from "@/server/db";
import { parseNeedId } from "./input";
import { assertTransaction } from "./transaction";

/**
 * Ids of the system accounts. The migration creates them with id = code =
 * kind, and a CHECK keeps it that way, so they are constants.
 */
export const SYSTEM_ACCOUNT = {
  GENERAL_FUND: "GENERAL_FUND",
  DONATIONS_IN: "DONATIONS_IN",
  EXPENSES_OUT: "EXPENSES_OUT",
  REFUNDS_OUT: "REFUNDS_OUT",
  FEES_OUT: "FEES_OUT",
  IN_KIND_IN: "IN_KIND_IN",
  IN_KIND_USED: "IN_KIND_USED",
} as const satisfies { [K in Exclude<LedgerAccountKind, "NEED">]: K };

/**
 * The need's own account, created on first call; returns its id. Runs in the
 * transaction that creates the need: an account can't be deleted, so one
 * left behind by a need that failed to save would stay forever.
 */
export async function createNeedAccount(
  tx: Db,
  needId: string,
): Promise<string> {
  assertTransaction(tx, "createNeedAccount");
  const id = parseNeedId(needId);
  // skipDuplicates (ON CONFLICT DO NOTHING): a concurrent or repeated call
  // finds the existing account instead of aborting the transaction.
  await tx.ledgerAccount.createMany({
    data: [{ kind: "NEED", needId: id, code: `need:${id}` }],
    skipDuplicates: true,
  });
  const account = await tx.ledgerAccount.findUniqueOrThrow({
    where: { needId: id },
    select: { id: true },
  });
  return account.id;
}
