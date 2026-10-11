import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_AMOUNT_KOP } from "@/lib/money";
import { getDb } from "@/server/db";
import { balance, LedgerError, post, reverse } from "@/server/ledger";
import {
  donate,
  newNeedAccount,
  sleep,
  SYSTEM_ACCOUNT,
  uniqueKey,
} from "./helpers";

const ACCOUNTS = 4;

const transfer = fc
  .record({
    from: fc.nat({ max: ACCOUNTS - 1 }),
    to: fc.nat({ max: ACCOUNTS - 1 }),
    // Up to the Int limit: a few of these push a balance past it.
    amountKop: fc.integer({ min: 1, max: MAX_AMOUNT_KOP }),
    reversed: fc.boolean(),
  })
  .filter((t) => t.from !== t.to);

async function ledgerTotal(): Promise<bigint> {
  const [row] = await getDb().$queryRaw<{ total: bigint }[]>`
    SELECT COALESCE(SUM("amountKop"), 0)::bigint AS total FROM "LedgerEntry"`;
  return row!.total;
}

describe("balance", () => {
  it("is the sum of the account's transfers, minus reversed ones", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(transfer, { minLength: 1, maxLength: 8 }),
        async (transfers) => {
          const accounts = await Promise.all(
            Array.from({ length: ACCOUNTS }, () => newNeedAccount()),
          );

          await getDb().$transaction(async (tx) => {
            for (const t of transfers) {
              const { transactionId } = await post(tx, {
                kind: "ALLOCATE_FROM_GENERAL",
                idempotencyKey: uniqueKey("transfer"),
                entries: [
                  { accountId: accounts[t.from]!, amountKop: -t.amountKop },
                  { accountId: accounts[t.to]!, amountKop: t.amountKop },
                ],
              });
              if (t.reversed) await reverse(tx, transactionId, "Проверка");
            }
          });

          const expected = accounts.map(() => 0);
          for (const t of transfers.filter((t) => !t.reversed)) {
            expected[t.from]! -= t.amountKop;
            expected[t.to]! += t.amountKop;
          }
          const actual = await Promise.all(
            accounts.map((id) => balance(getDb(), id)),
          );
          expect(actual).toEqual(expected);
          expect(actual.reduce((sum, kop) => sum + kop, 0)).toBe(0);
        },
      ),
      { numRuns: 25 },
    );

    // Every transaction balances, so the whole ledger does.
    expect(await ledgerTotal()).toBe(BigInt(0));
  });

  it("counts only entries posted before `at`", async () => {
    const need = await newNeedAccount();
    const first = await donate(need, 100_000);
    await sleep(10);
    const second = await donate(need, 200_000);

    const at = (result: { postedAt: Date }, ms = 0) =>
      new Date(result.postedAt.getTime() + ms);
    expect(second.postedAt.getTime()).toBeGreaterThan(first.postedAt.getTime());
    expect(await balance(getDb(), need, at(first))).toBe(0);
    expect(await balance(getDb(), need, at(first, 1))).toBe(100_000);
    expect(await balance(getDb(), need, at(second))).toBe(100_000);
    expect(await balance(getDb(), need, at(second, 1))).toBe(300_000);
    expect(await balance(getDb(), need)).toBe(300_000);
  });

  it("goes past the Int limit of a single amount", async () => {
    const need = await newNeedAccount();
    await donate(need, 2_000_000_000);
    await donate(need, 2_000_000_000);

    expect(await balance(getDb(), need)).toBe(4_000_000_000);
  });

  it("sees the caller's uncommitted postings inside its transaction", async () => {
    const need = await newNeedAccount();

    await getDb().$transaction(async (tx) => {
      await post(tx, {
        kind: "DONATION",
        idempotencyKey: uniqueKey("donation"),
        entries: [
          { accountId: SYSTEM_ACCOUNT.DONATIONS_IN, amountKop: -5_000 },
          { accountId: need, amountKop: 5_000 },
        ],
      });
      expect(await balance(tx, need)).toBe(5_000);
      expect(await balance(getDb(), need)).toBe(0);
    });
  });

  it("refuses an unknown account and an invalid date", async () => {
    const need = await newNeedAccount();

    await expect(balance(getDb(), "no-such-account")).rejects.toEqual(
      expect.objectContaining({ code: "UNKNOWN_ACCOUNT" }),
    );
    await expect(
      balance(getDb(), need, new Date("not a date")),
    ).rejects.toBeInstanceOf(LedgerError);
  });
});
