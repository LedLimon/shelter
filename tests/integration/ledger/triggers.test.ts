// The database guards the ledger on its own, whatever the application does:
// these tests go around src/server/ledger and write to the tables directly.
import { beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/server/db";
import {
  donate,
  newNeedAccount,
  SYSTEM_ACCOUNT,
  transactionsWithKey,
  uniqueKey,
} from "./helpers";

const APPEND_ONLY =
  /ledger: (UPDATE|DELETE|TRUNCATE) on "Ledger\w+" is forbidden/;

/** Inserts a transaction and its entries as given, no module checks. */
async function insertRaw(
  tx: Prisma.TransactionClient,
  data: {
    kind?: Prisma.LedgerTransactionCreateManyInput["kind"];
    idempotencyKey?: string;
    reversesId?: string;
    amounts: [accountId: string, amountKop: number][];
  },
): Promise<string> {
  const [created] = await tx.ledgerTransaction.createManyAndReturn({
    data: [
      {
        kind: data.kind ?? "DONATION",
        idempotencyKey: data.idempotencyKey ?? uniqueKey("raw"),
        reversesId: data.reversesId,
      },
    ],
    select: { id: true, postedAt: true },
  });
  if (data.amounts.length > 0) {
    await tx.ledgerEntry.createMany({
      data: data.amounts.map(([accountId, amountKop]) => ({
        transactionId: created!.id,
        accountId,
        amountKop,
        postedAt: created!.postedAt,
      })),
    });
  }
  return created!.id;
}

let needAccount: string;
let posted: { transactionId: string };

beforeAll(async () => {
  needAccount = await newNeedAccount();
  posted = await donate(needAccount, 150_000);
});

describe("append-only", () => {
  it("rejects UPDATE of transactions, entries and accounts", async () => {
    const db = getDb();

    await expect(
      db.ledgerTransaction.update({
        where: { id: posted.transactionId },
        data: { publicMemo: "исправлено" },
      }),
    ).rejects.toThrow(APPEND_ONLY);
    await expect(
      db.ledgerEntry.updateMany({
        where: { transactionId: posted.transactionId },
        data: { amountKop: 1 },
      }),
    ).rejects.toThrow(APPEND_ONLY);
    await expect(
      db.ledgerAccount.update({
        where: { id: needAccount },
        data: { code: "need:other" },
      }),
    ).rejects.toThrow(APPEND_ONLY);
    await expect(
      db.$executeRaw`UPDATE "LedgerEntry" SET "amountKop" = "amountKop" * 2`,
    ).rejects.toThrow(APPEND_ONLY);
  });

  it("rejects an UPDATE even when it matches no rows", async () => {
    await expect(
      getDb().ledgerEntry.updateMany({
        where: { id: "no-such-entry" },
        data: { amountKop: 1 },
      }),
    ).rejects.toThrow(APPEND_ONLY);
  });

  it("rejects DELETE", async () => {
    const db = getDb();

    await expect(
      db.ledgerEntry.deleteMany({
        where: { transactionId: posted.transactionId },
      }),
    ).rejects.toThrow(APPEND_ONLY);
    await expect(
      db.ledgerTransaction.delete({ where: { id: posted.transactionId } }),
    ).rejects.toThrow(APPEND_ONLY);
    await expect(
      db.ledgerAccount.delete({ where: { id: needAccount } }),
    ).rejects.toThrow(APPEND_ONLY);
  });

  it("rejects TRUNCATE, which skips row triggers", async () => {
    for (const table of ["LedgerEntry", "LedgerTransaction", "LedgerAccount"]) {
      await expect(
        getDb().$executeRawUnsafe(`TRUNCATE "${table}" CASCADE`),
      ).rejects.toThrow(APPEND_ONLY);
    }
  });

  it("rejects an upsert (INSERT … ON CONFLICT DO UPDATE)", async () => {
    await expect(
      getDb().$executeRaw`
        INSERT INTO "LedgerAccount" ("id", "code", "kind")
        VALUES ('GENERAL_FUND', 'GENERAL_FUND', 'GENERAL_FUND')
        ON CONFLICT ("id") DO UPDATE SET "code" = 'GENERAL_FUND_2'`,
    ).rejects.toThrow(APPEND_ONLY);
  });

  it("leaves the data intact", async () => {
    const transaction = await getDb().ledgerTransaction.findUniqueOrThrow({
      where: { id: posted.transactionId },
      include: { entries: true },
    });

    expect(transaction.publicMemo).toBeNull();
    expect(
      transaction.entries.map((e) => [e.accountId, e.amountKop]).sort(),
    ).toEqual([
      [SYSTEM_ACCOUNT.DONATIONS_IN, -150_000],
      [needAccount, 150_000],
    ]);
  });
});

describe("balance at commit", () => {
  it("fails an unbalanced transaction at commit, not at insert", async () => {
    const key = uniqueKey("unbalanced");
    let inserted = false;

    await expect(
      getDb().$transaction(async (tx) => {
        await insertRaw(tx, {
          idempotencyKey: key,
          amounts: [
            [SYSTEM_ACCOUNT.DONATIONS_IN, -100_000],
            [needAccount, 99_999],
          ],
        });
        inserted = true;
      }),
    ).rejects.toThrow(
      /ledger: transaction \w+ is unbalanced, its entries sum to -1 kop/,
    );

    expect(inserted).toBe(true);
    expect(await transactionsWithKey(key)).toEqual([]);
  });

  it("allows the entries to balance over several statements", async () => {
    const key = uniqueKey("stepwise");

    await getDb().$transaction(async (tx) => {
      const id = await insertRaw(tx, {
        idempotencyKey: key,
        amounts: [[SYSTEM_ACCOUNT.DONATIONS_IN, -500]],
      });
      const { postedAt } = await tx.ledgerTransaction.findUniqueOrThrow({
        where: { id },
      });
      await tx.ledgerEntry.createMany({
        data: [
          {
            transactionId: id,
            accountId: needAccount,
            amountKop: 200,
            postedAt,
          },
          {
            transactionId: id,
            accountId: needAccount,
            amountKop: 300,
            postedAt,
          },
        ],
      });
    });

    expect(await transactionsWithKey(key)).toHaveLength(1);
  });

  it("rejects a transaction with fewer than two entries", async () => {
    const cases: [string, number][][] = [[], [[needAccount, 100]]];
    for (const amounts of cases) {
      await expect(
        getDb().$transaction((tx) => insertRaw(tx, { amounts })),
      ).rejects.toThrow(/ledger: transaction \w+ has [01] entries/);
    }
  });

  it("rejects a zero entry", async () => {
    await expect(
      getDb().$transaction((tx) =>
        insertRaw(tx, {
          amounts: [
            [SYSTEM_ACCOUNT.DONATIONS_IN, 0],
            [needAccount, 0],
          ],
        }),
      ),
    ).rejects.toThrow(/LedgerEntry_amount_not_zero/);
  });
});

describe("a committed transaction is closed", () => {
  it("rejects entries added to it later, even balanced ones", async () => {
    const { postedAt } = await getDb().ledgerTransaction.findUniqueOrThrow({
      where: { id: posted.transactionId },
    });

    await expect(
      getDb().$transaction((tx) =>
        tx.ledgerEntry.createMany({
          data: [
            {
              transactionId: posted.transactionId,
              accountId: SYSTEM_ACCOUNT.GENERAL_FUND,
              amountKop: -1_000,
              postedAt,
            },
            {
              transactionId: posted.transactionId,
              accountId: needAccount,
              amountKop: 1_000,
              postedAt,
            },
          ],
        }),
      ),
    ).rejects.toThrow(
      /ledger: entries are added only together with their transaction/,
    );
  });

  it("accepts entries for a transaction created in a released savepoint", async () => {
    const key = uniqueKey("savepoint");

    await getDb().$transaction(async (tx) => {
      // A nested $transaction is a savepoint on the same connection.
      const id = await tx.$transaction((inner) =>
        insertRaw(inner, { idempotencyKey: key, amounts: [] }),
      );
      const { postedAt } = await tx.ledgerTransaction.findUniqueOrThrow({
        where: { id },
      });
      await tx.ledgerEntry.createMany({
        data: [
          {
            transactionId: id,
            accountId: SYSTEM_ACCOUNT.DONATIONS_IN,
            amountKop: -10,
            postedAt,
          },
          {
            transactionId: id,
            accountId: needAccount,
            amountKop: 10,
            postedAt,
          },
        ],
      });
    });

    expect(await transactionsWithKey(key)).toHaveLength(1);
  });
});

describe("postedAt", () => {
  it("is the database's transaction time", async () => {
    const [row] = await getDb().$queryRaw<{ matches: boolean }[]>`
      SELECT "postedAt" = (
        SELECT "postedAt" FROM "LedgerEntry" WHERE "transactionId" = t."id" LIMIT 1
      ) AS matches
      FROM "LedgerTransaction" t WHERE t."id" = ${posted.transactionId}`;

    expect(row?.matches).toBe(true);
  });

  it("can't be passed: no backdating", async () => {
    await expect(
      getDb().$transaction((tx) =>
        tx.ledgerTransaction.create({
          data: {
            kind: "DONATION",
            idempotencyKey: uniqueKey("backdated"),
            postedAt: new Date("2026-01-15T12:00:00Z"),
          },
        }),
      ),
    ).rejects.toThrow(/ledger: "postedAt" is set by the database/);
  });

  it("comes with the creating transaction's id, which can't be passed", async () => {
    await expect(
      getDb().$transaction(
        (tx) => tx.$executeRaw`
          INSERT INTO "LedgerTransaction" ("id", "kind", "idempotencyKey", "createdXid")
          VALUES ('forged', 'DONATION', ${uniqueKey("forged")}, '1'::xid8)`,
      ),
    ).rejects.toThrow(/ledger: "createdXid" is set by the database/);
  });

  it("of an entry must equal its transaction's", async () => {
    await expect(
      getDb().$transaction(async (tx) => {
        const [created] = await tx.ledgerTransaction.createManyAndReturn({
          data: [{ kind: "DONATION", idempotencyKey: uniqueKey("skew") }],
        });
        await tx.ledgerEntry.create({
          data: {
            transactionId: created!.id,
            accountId: needAccount,
            amountKop: 100,
            postedAt: new Date(created!.postedAt.getTime() - 1),
          },
        });
      }),
    ).rejects.toThrow(
      /ledger: an entry's "postedAt" must equal its transaction's/,
    );
  });
});

describe("reversals", () => {
  it("must mirror the reversed transaction's entries exactly", async () => {
    const original = await donate(needAccount, 70_000);

    await expect(
      getDb().$transaction((tx) =>
        insertRaw(tx, {
          kind: "REVERSAL",
          reversesId: original.transactionId,
          // Half the amount: would quietly keep 350 ₽ on the need.
          amounts: [
            [SYSTEM_ACCOUNT.DONATIONS_IN, 35_000],
            [needAccount, -35_000],
          ],
        }),
      ),
    ).rejects.toThrow(/ledger: reversal \w+ doesn't mirror the entries of/);

    await expect(
      getDb().$transaction((tx) =>
        insertRaw(tx, {
          kind: "REVERSAL",
          reversesId: original.transactionId,
          // Right amounts, wrong account.
          amounts: [
            [SYSTEM_ACCOUNT.DONATIONS_IN, 70_000],
            [SYSTEM_ACCOUNT.GENERAL_FUND, -70_000],
          ],
        }),
      ),
    ).rejects.toThrow(/doesn't mirror/);
  });

  it("can happen only once per transaction, whatever the key", async () => {
    const original = await donate(needAccount, 20_000);
    const mirror: [string, number][] = [
      [SYSTEM_ACCOUNT.DONATIONS_IN, 20_000],
      [needAccount, -20_000],
    ];
    const reversal = await getDb().$transaction((tx) =>
      insertRaw(tx, {
        kind: "REVERSAL",
        reversesId: original.transactionId,
        amounts: mirror,
      }),
    );

    await expect(
      getDb().$transaction((tx) =>
        insertRaw(tx, {
          kind: "REVERSAL",
          idempotencyKey: uniqueKey("second-reversal"),
          reversesId: original.transactionId,
          amounts: mirror,
        }),
      ),
    ).rejects.toThrow(/reversesId/);

    // Nor can a reversal be reversed (the original would be counted again).
    await expect(
      getDb().$transaction((tx) =>
        insertRaw(tx, {
          kind: "REVERSAL",
          reversesId: reversal,
          amounts: mirror.map(([a, kop]) => [a, -kop]),
        }),
      ),
    ).rejects.toThrow(/ledger: a reversal can't be reversed/);
  });

  it("is the only kind that points at a transaction", async () => {
    await expect(
      getDb().$transaction((tx) =>
        insertRaw(tx, {
          kind: "REFUND",
          reversesId: posted.transactionId,
          amounts: [
            [SYSTEM_ACCOUNT.DONATIONS_IN, 150_000],
            [needAccount, -150_000],
          ],
        }),
      ),
    ).rejects.toThrow(/LedgerTransaction_reversal_shape/);
    await expect(
      getDb().$transaction((tx) =>
        insertRaw(tx, {
          kind: "REVERSAL",
          amounts: [
            [SYSTEM_ACCOUNT.DONATIONS_IN, 1],
            [needAccount, -1],
          ],
        }),
      ),
    ).rejects.toThrow(/LedgerTransaction_reversal_shape/);
  });
});

describe("accounts", () => {
  it("has the system accounts from the migration, id = code = kind", async () => {
    const accounts = await getDb().ledgerAccount.findMany({
      where: { kind: { not: "NEED" } },
      orderBy: { id: "asc" },
    });

    expect(accounts.map((a) => [a.id, a.code, a.kind])).toEqual(
      Object.values(SYSTEM_ACCOUNT)
        .sort()
        .map((kind) => [kind, kind, kind]),
    );
  });

  it("rejects a second system account of a kind or a misnamed one", async () => {
    await expect(
      getDb().ledgerAccount.create({
        data: { kind: "GENERAL_FUND", code: "GENERAL_FUND_2" },
      }),
    ).rejects.toThrow(/LedgerAccount_shape/);
    await expect(
      getDb().ledgerAccount.create({
        data: { id: "FEES_OUT", kind: "GENERAL_FUND", code: "FEES_OUT" },
      }),
    ).rejects.toThrow(/LedgerAccount_shape/);
  });

  it("ties a NEED account to exactly one need", async () => {
    await expect(
      getDb().ledgerAccount.create({ data: { kind: "NEED", code: "need:" } }),
    ).rejects.toThrow(/LedgerAccount_shape/);
    await expect(
      getDb().ledgerAccount.create({
        data: { kind: "NEED", code: "need:x", needId: "y" },
      }),
    ).rejects.toThrow(/LedgerAccount_shape/);
  });
});
