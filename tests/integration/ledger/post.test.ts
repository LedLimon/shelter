import { describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import {
  balance,
  createNeedAccount,
  type LedgerErrorCode,
  post,
  reverse,
} from "@/server/ledger";
import {
  donate,
  donation,
  newNeedAccount,
  sleep,
  SYSTEM_ACCOUNT,
  transactionsWithKey,
  uniqueKey,
} from "./helpers";

const ledgerError = (code: LedgerErrorCode) => ({ name: "LedgerError", code });

describe("post", () => {
  it("writes a transaction with its entries", async () => {
    const need = await newNeedAccount();
    const occurredAt = new Date("2026-10-01T09:30:00Z");
    const actor = await getDb().user.create({
      data: { email: "admin-post@example.ru", name: "Анна", role: "ADMIN" },
    });

    const result = await getDb().$transaction((tx) =>
      post(tx, {
        kind: "ALLOCATE_FROM_GENERAL",
        idempotencyKey: "allocate:test-1",
        entries: [
          { accountId: SYSTEM_ACCOUNT.GENERAL_FUND, amountKop: -40_000 },
          { accountId: need, amountKop: 40_000 },
        ],
        publicMemo: "Из общего фонда на корм",
        occurredAt,
        links: { actorId: actor.id },
      }),
    );

    expect(result.created).toBe(true);
    const [stored] = await transactionsWithKey("allocate:test-1");
    expect(stored).toMatchObject({
      id: result.transactionId,
      kind: "ALLOCATE_FROM_GENERAL",
      publicMemo: "Из общего фонда на корм",
      occurredAt,
      postedAt: result.postedAt,
      actorId: actor.id,
      reversesId: null,
    });
    expect(
      stored!.entries.map((e) => [e.accountId, e.amountKop, e.postedAt]).sort(),
    ).toEqual(
      [
        [SYSTEM_ACCOUNT.GENERAL_FUND, -40_000, result.postedAt],
        [need, 40_000, result.postedAt],
      ].sort(),
    );
  });

  it("is a no-op when repeated with the same key", async () => {
    const need = await newNeedAccount();
    const input = donation(need, 300_000);

    const first = await getDb().$transaction((tx) => post(tx, input));
    const second = await getDb().$transaction((tx) => post(tx, input));

    expect(first.created).toBe(true);
    expect(second).toEqual({ ...first, created: false });
    expect(await transactionsWithKey(input.idempotencyKey)).toHaveLength(1);
    expect(await balance(getDb(), need)).toBe(300_000);
  });

  it("posts once when the same webhook arrives 5 times at once", async () => {
    const need = await newNeedAccount();
    const input = donation(need, 150_000);
    const before = await balance(getDb(), SYSTEM_ACCOUNT.DONATIONS_IN);

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        getDb().$transaction((tx) => post(tx, input)),
      ),
    );

    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.transactionId)).size).toBe(1);
    expect(await transactionsWithKey(input.idempotencyKey)).toHaveLength(1);
    expect(await balance(getDb(), need)).toBe(150_000);
    expect(await balance(getDb(), SYSTEM_ACCOUNT.DONATIONS_IN)).toBe(
      before - 150_000,
    );
  });

  it("posts after all when the first attempt with the key rolls back", async () => {
    const need = await newNeedAccount();
    const input = donation(need, 50_000);
    let firstPosted!: () => void;
    const firstHasPosted = new Promise<void>((r) => (firstPosted = r));
    let releaseFirst!: () => void;
    const firstMayEnd = new Promise<void>((r) => (releaseFirst = r));

    const first = getDb().$transaction(
      async (tx) => {
        await post(tx, input);
        firstPosted();
        await firstMayEnd;
        throw new Error("webhook handler failed after posting");
      },
      { timeout: 10_000 },
    );
    await firstHasPosted;

    // The second waits on the unique key until the first ends.
    let secondDone = false;
    const second = getDb()
      .$transaction((tx) => post(tx, input), { timeout: 10_000 })
      .finally(() => (secondDone = true));
    await sleep(300);
    expect(secondDone).toBe(false);

    releaseFirst();
    await expect(first).rejects.toThrow("webhook handler failed");
    expect((await second).created).toBe(true);
    expect(await transactionsWithKey(input.idempotencyKey)).toHaveLength(1);
    expect(await balance(getDb(), need)).toBe(50_000);
  });

  it("refuses a key already used for a different transaction", async () => {
    const need = await newNeedAccount();
    const input = donation(need, 100_000);
    await getDb().$transaction((tx) => post(tx, input));

    await expect(
      getDb().$transaction((tx) =>
        post(tx, {
          ...input,
          entries: [
            { accountId: SYSTEM_ACCOUNT.DONATIONS_IN, amountKop: -120_000 },
            { accountId: need, amountKop: 120_000 },
          ],
        }),
      ),
    ).rejects.toMatchObject(ledgerError("IDEMPOTENCY_CONFLICT"));
    await expect(
      getDb().$transaction((tx) => post(tx, { ...input, kind: "OVERFLOW" })),
    ).rejects.toMatchObject(ledgerError("IDEMPOTENCY_CONFLICT"));
    expect(await balance(getDb(), need)).toBe(100_000);
  });

  it("posts several transactions in one database transaction", async () => {
    // A donation of 3000 ₽ to a need with 2000 ₽ left (docs/ledger.md).
    const need = await newNeedAccount();
    const generalBefore = await balance(getDb(), SYSTEM_ACCOUNT.GENERAL_FUND);

    const [toNeed, overflow] = await getDb().$transaction(async (tx) => [
      await post(tx, {
        kind: "DONATION",
        idempotencyKey: "donation:d-3000",
        entries: [
          { accountId: SYSTEM_ACCOUNT.DONATIONS_IN, amountKop: -200_000 },
          { accountId: need, amountKop: 200_000 },
        ],
      }),
      await post(tx, {
        kind: "OVERFLOW",
        idempotencyKey: "overflow:d-3000",
        entries: [
          { accountId: SYSTEM_ACCOUNT.DONATIONS_IN, amountKop: -100_000 },
          { accountId: SYSTEM_ACCOUNT.GENERAL_FUND, amountKop: 100_000 },
        ],
        publicMemo: "Переплата 1000 ₽ → общий фонд",
      }),
    ]);

    expect(toNeed.postedAt).toEqual(overflow.postedAt);
    const rows = await getDb().ledgerTransaction.findMany({
      where: { id: { in: [toNeed.transactionId, overflow.transactionId] } },
      orderBy: { seq: "asc" },
    });
    expect(rows.map((r) => r.kind)).toEqual(["DONATION", "OVERFLOW"]);
    expect(await balance(getDb(), need)).toBe(200_000);
    expect(await balance(getDb(), SYSTEM_ACCOUNT.GENERAL_FUND)).toBe(
      generalBefore + 100_000,
    );
  });

  it("must run inside a transaction", async () => {
    const need = await newNeedAccount();
    const input = donation(need, 10_000);

    await expect(post(getDb(), input)).rejects.toMatchObject(
      ledgerError("NOT_IN_TRANSACTION"),
    );
    expect(await transactionsWithKey(input.idempotencyKey)).toEqual([]);
  });

  it("refuses an unknown account and writes nothing", async () => {
    const input = donation("no-such-account", 10_000);

    await expect(
      getDb().$transaction((tx) => post(tx, input)),
    ).rejects.toMatchObject(ledgerError("UNKNOWN_ACCOUNT"));
    expect(await transactionsWithKey(input.idempotencyKey)).toEqual([]);
  });

  it("refuses invalid input before touching the database", async () => {
    const need = await newNeedAccount();
    const input = donation(need, 10_000, {
      entries: [
        {
          accountId: SYSTEM_ACCOUNT.DONATIONS_IN,
          amountKop: -1998.9999999999998,
        },
        { accountId: need, amountKop: 1998.9999999999998 },
      ],
    });

    await expect(
      getDb().$transaction((tx) => post(tx, input)),
    ).rejects.toMatchObject(ledgerError("INVALID_INPUT"));
    expect(await transactionsWithKey(input.idempotencyKey)).toEqual([]);
  });
});

describe("reverse", () => {
  it("posts the mirror of a transaction and restores the balances", async () => {
    const need = await newNeedAccount();
    const donationsBefore = await balance(getDb(), SYSTEM_ACCOUNT.DONATIONS_IN);
    const original = await donate(need, 250_000);

    const reversal = await getDb().$transaction((tx) =>
      reverse(tx, original.transactionId, "Платёж отменён банком"),
    );

    expect(reversal.created).toBe(true);
    const stored = await getDb().ledgerTransaction.findUniqueOrThrow({
      where: { id: reversal.transactionId },
      include: { entries: true },
    });
    expect(stored).toMatchObject({
      kind: "REVERSAL",
      reversesId: original.transactionId,
      idempotencyKey: `reversal:${original.transactionId}`,
      publicMemo: "Платёж отменён банком",
    });
    expect(
      stored.entries.map((e) => [e.accountId, e.amountKop]).sort(),
    ).toEqual(
      [
        [SYSTEM_ACCOUNT.DONATIONS_IN, 250_000],
        [need, -250_000],
      ].sort(),
    );
    expect(await balance(getDb(), need)).toBe(0);
    expect(await balance(getDb(), SYSTEM_ACCOUNT.DONATIONS_IN)).toBe(
      donationsBefore,
    );
  });

  it("reverses a transaction only once", async () => {
    const need = await newNeedAccount();
    const original = await donate(need, 80_000);

    const first = await getDb().$transaction((tx) =>
      reverse(tx, original.transactionId, "Ошибка в сумме"),
    );
    const again = await getDb().$transaction((tx) =>
      reverse(tx, original.transactionId, "Другая причина"),
    );

    expect(again).toEqual({ ...first, created: false });
    expect(
      await getDb().ledgerTransaction.count({
        where: { reversesId: original.transactionId },
      }),
    ).toBe(1);
    expect(await balance(getDb(), need)).toBe(0);
  });

  it("reverses once under 5 concurrent attempts", async () => {
    const need = await newNeedAccount();
    const original = await donate(need, 60_000);

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        getDb().$transaction((tx) =>
          reverse(tx, original.transactionId, "Двойное нажатие"),
        ),
      ),
    );

    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(
      await getDb().ledgerTransaction.count({
        where: { reversesId: original.transactionId },
      }),
    ).toBe(1);
    expect(await balance(getDb(), need)).toBe(0);
  });

  it("refuses to reverse a reversal", async () => {
    const need = await newNeedAccount();
    const original = await donate(need, 30_000);
    const reversal = await getDb().$transaction((tx) =>
      reverse(tx, original.transactionId, "Ошибка"),
    );

    await expect(
      getDb().$transaction((tx) =>
        reverse(tx, reversal.transactionId, "Отмена отмены"),
      ),
    ).rejects.toMatchObject(ledgerError("REVERSAL_OF_REVERSAL"));
    expect(await balance(getDb(), need)).toBe(0);
  });

  it("refuses an unknown transaction, a blank reason, and no transaction", async () => {
    const need = await newNeedAccount();
    const original = await donate(need, 30_000);

    await expect(
      getDb().$transaction((tx) => reverse(tx, "no-such-tx", "Ошибка")),
    ).rejects.toMatchObject(ledgerError("UNKNOWN_TRANSACTION"));
    await expect(
      getDb().$transaction((tx) => reverse(tx, original.transactionId, " ")),
    ).rejects.toMatchObject(ledgerError("INVALID_INPUT"));
    await expect(
      reverse(getDb(), original.transactionId, "Ошибка"),
    ).rejects.toMatchObject(ledgerError("NOT_IN_TRANSACTION"));
    expect(await balance(getDb(), need)).toBe(30_000);
  });
});

describe("createNeedAccount", () => {
  it("creates the account once per need", async () => {
    const needId = `need-${uniqueKey()}`;

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        getDb().$transaction((tx) => createNeedAccount(tx, needId)),
      ),
    );
    const again = await getDb().$transaction((tx) =>
      createNeedAccount(tx, needId),
    );

    expect(new Set([...results, again]).size).toBe(1);
    expect(
      await getDb().ledgerAccount.findUniqueOrThrow({ where: { needId } }),
    ).toMatchObject({ id: again, kind: "NEED", code: `need:${needId}` });
    expect(await balance(getDb(), again)).toBe(0);
  });

  it("rolls back with the transaction that creates the need", async () => {
    const needId = `need-${uniqueKey()}`;

    await expect(
      getDb().$transaction(async (tx) => {
        await createNeedAccount(tx, needId);
        throw new Error("need validation failed");
      }),
    ).rejects.toThrow("need validation failed");
    expect(
      await getDb().ledgerAccount.findUnique({ where: { needId } }),
    ).toBeNull();
  });
});
