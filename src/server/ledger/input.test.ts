import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_AMOUNT_KOP } from "@/lib/money";
import { LedgerError } from "./errors";
import { parsePostInput, parseReverseInput, type PostInput } from "./input";

const valid: PostInput = {
  kind: "DONATION",
  idempotencyKey: "donation:abc",
  entries: [
    { accountId: "DONATIONS_IN", amountKop: -150_000 },
    { accountId: "GENERAL_FUND", amountKop: 150_000 },
  ],
};

const rejects = (input: unknown, message: RegExp) =>
  expect(() => parsePostInput(input)).toThrow(message);

/** Non-zero entries in range that sum to zero: n − 1 random, the last balances. */
const balancedEntries = fc
  .array(
    fc
      .integer({ min: -1_000_000_000, max: 1_000_000_000 })
      .filter((kop) => kop !== 0),
    { minLength: 1, maxLength: 20 },
  )
  .map((amounts) => [...amounts, -amounts.reduce((sum, kop) => sum + kop, 0)])
  .filter((amounts) =>
    amounts.every((kop) => kop !== 0 && Math.abs(kop) <= MAX_AMOUNT_KOP),
  )
  .map((amounts) =>
    amounts.map((amountKop, i) => ({ accountId: `account-${i}`, amountKop })),
  );

describe("parsePostInput", () => {
  it("accepts a balanced transaction", () => {
    expect(parsePostInput(valid)).toEqual(valid);
  });

  it("accepts any set of non-zero integer entries summing to zero", () => {
    fc.assert(
      fc.property(balancedEntries, (entries) => {
        expect(parsePostInput({ ...valid, entries }).entries).toEqual(entries);
      }),
    );
  });

  it("rejects entries that don't sum to zero", () => {
    fc.assert(
      fc.property(
        balancedEntries,
        fc.integer({ min: -1000, max: 1000 }).filter((d) => d !== 0),
        (entries, delta) => {
          const [first, ...rest] = entries;
          const shifted = { ...first!, amountKop: first!.amountKop + delta };
          fc.pre(shifted.amountKop !== 0);
          rejects({ ...valid, entries: [shifted, ...rest] }, /sum to zero/);
        },
      ),
    );
  });

  it("rejects amounts that aren't whole kopecks", () => {
    // Number("19.99") * 100, which Prisma would silently write as 1998.
    for (const amountKop of [
      1998.9999999999998,
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      rejects(
        {
          ...valid,
          entries: [
            { accountId: "DONATIONS_IN", amountKop: -amountKop },
            { accountId: "GENERAL_FUND", amountKop },
          ],
        },
        /invalid post\(\) input/,
      );
    }
  });

  it("rejects zero and out-of-range amounts", () => {
    for (const amountKop of [0, MAX_AMOUNT_KOP + 1]) {
      rejects(
        {
          ...valid,
          entries: [
            { accountId: "DONATIONS_IN", amountKop: -amountKop },
            { accountId: "GENERAL_FUND", amountKop },
          ],
        },
        /invalid post\(\) input/,
      );
    }
  });

  it("needs at least two entries", () => {
    rejects({ ...valid, entries: [] }, /entries/);
    rejects(
      { ...valid, entries: [{ accountId: "GENERAL_FUND", amountKop: 100 }] },
      /entries/,
    );
  });

  it("leaves REVERSAL to reverse()", () => {
    rejects({ ...valid, kind: "REVERSAL" }, /reverse\(\)/);
  });

  it("rejects blank or spaced idempotency keys", () => {
    for (const idempotencyKey of ["", " ", "donation: abc", "x".repeat(201)]) {
      rejects({ ...valid, idempotencyKey }, /idempotencyKey/);
    }
  });

  it("rejects fields it doesn't know, like postedAt", () => {
    rejects({ ...valid, postedAt: new Date() }, /postedAt/);
    rejects({ ...valid, links: { donationId: "d1" } }, /donationId/);
  });

  it("rejects an invalid occurredAt and a blank memo", () => {
    rejects({ ...valid, occurredAt: new Date("nope") }, /occurredAt/);
    rejects({ ...valid, publicMemo: "  " }, /publicMemo/);
  });

  it("throws a LedgerError with code INVALID_INPUT", () => {
    try {
      parsePostInput({ ...valid, entries: [] });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(LedgerError);
      expect((error as LedgerError).code).toBe("INVALID_INPUT");
    }
  });
});

describe("parseReverseInput", () => {
  it("needs a transaction and a reason", () => {
    expect(
      parseReverseInput({ transactionId: "t1", reason: "Ошибка в сумме" }),
    ).toEqual({ transactionId: "t1", reason: "Ошибка в сумме" });
    expect(() =>
      parseReverseInput({ transactionId: "t1", reason: " " }),
    ).toThrow(/reason/);
    expect(() => parseReverseInput({ transactionId: "", reason: "x" })).toThrow(
      /transactionId/,
    );
  });
});
