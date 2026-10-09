// Shared by the ledger tests. A file's tests share one database, so each test
// works on fresh need accounts or compares balance deltas, not absolutes.
import { randomUUID } from "node:crypto";
import { getDb } from "@/server/db";
import {
  createNeedAccount,
  post,
  SYSTEM_ACCOUNT,
  type PostInput,
  type PostResult,
} from "@/server/ledger";

export { SYSTEM_ACCOUNT };

export function uniqueKey(prefix = "test"): string {
  return `${prefix}:${randomUUID()}`;
}

/** A new NEED account (the Need model comes with NEED-1: any id will do). */
export async function newNeedAccount(): Promise<string> {
  return getDb().$transaction((tx) =>
    createNeedAccount(tx, `need-${randomUUID()}`),
  );
}

/** A donation of `amountKop` to `accountId`, in its own transaction. */
export function donate(
  accountId: string,
  amountKop: number,
  overrides: Partial<PostInput> = {},
): Promise<PostResult> {
  return getDb().$transaction((tx) =>
    post(tx, donation(accountId, amountKop, overrides)),
  );
}

export function donation(
  accountId: string,
  amountKop: number,
  overrides: Partial<PostInput> = {},
): PostInput {
  return {
    kind: "DONATION",
    idempotencyKey: uniqueKey("donation"),
    entries: [
      { accountId: SYSTEM_ACCOUNT.DONATIONS_IN, amountKop: -amountKop },
      { accountId, amountKop },
    ],
    ...overrides,
  };
}

/** The database's clock: the container's may differ from this process's. */
export async function dbNow(): Promise<Date> {
  const [row] = await getDb().$queryRaw<{ now: Date }[]>`
    SELECT clock_timestamp() AS now`;
  return row!.now;
}

export async function transactionsWithKey(key: string) {
  return getDb().ledgerTransaction.findMany({
    where: { idempotencyKey: key },
    include: { entries: true },
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
