// Publishing a report is final, and the file's tests share a database: they
// run in order. Periods are set around the database's clock, so the calendar
// date doesn't matter; a month can be published only once its end has passed.
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import { post, reverse } from "@/server/ledger";
import {
  dbNow,
  donate,
  donation,
  newNeedAccount,
  sleep,
  transactionsWithKey,
} from "./helpers";

const HOUR = 3_600_000;
const CLOSED = /ledger: the report for \S+ is published, nothing can be posted/;
const FINAL = /ledger: the report for \S+ is published, its month stays closed/;
const NOT_OVER = /ledger: \S+ lasts until .+, it can't be published before/;

let need: string;
let now: Date;

beforeAll(async () => {
  need = await newNeedAccount();
  now = await dbNow();
});

const at = (hours: number) => new Date(now.getTime() + hours * HOUR);

/** Resolves when the database's clock has passed `moment`. */
async function waitUntilPast(moment: Date): Promise<void> {
  while ((await dbNow()).getTime() <= moment.getTime()) await sleep(50);
}

/**
 * Resolves once a session of this database waits for the period lock in
 * `mode`: "ExclusiveLock" — a publication, "ShareLock" — a posting.
 */
async function waitForLockWaiter(
  mode: "ExclusiveLock" | "ShareLock",
): Promise<void> {
  for (;;) {
    const [row] = await getDb().$queryRaw<{ waiting: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM pg_locks
         WHERE locktype = 'advisory' AND mode = ${mode} AND NOT granted
           AND database = (
             SELECT oid FROM pg_database WHERE datname = current_database()
           )
      ) AS waiting`;
    if (row?.waiting) return;
    await sleep(20);
  }
}

/** A promise and the function that resolves it. */
function signal<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("closed months", () => {
  it("posts while the month's report is a draft", async () => {
    await getDb().monthlyReport.create({
      data: { period: "2026-10", periodStart: at(-24), periodEnd: at(24) },
    });

    expect((await donate(need, 10_000)).created).toBe(true);
  });

  it("refuses to publish a month that isn't over", async () => {
    await expect(
      getDb().monthlyReport.update({
        where: { period: "2026-10" },
        data: { status: "PUBLISHED" },
      }),
    ).rejects.toThrow(NOT_OVER);
    await expect(
      getDb().monthlyReport.create({
        data: {
          period: "2026-12",
          periodStart: at(48),
          periodEnd: at(72),
          status: "PUBLISHED",
        },
      }),
    ).rejects.toThrow(NOT_OVER);
  });

  it("posts a late event of a closed month into the current one", async () => {
    await getDb().monthlyReport.create({
      data: {
        period: "2026-09",
        periodStart: at(-48),
        periodEnd: at(-24),
        status: "PUBLISHED",
      },
    });
    const paidInClosedMonth = at(-36);

    const result = await donate(need, 20_000, {
      occurredAt: paidInClosedMonth,
      publicMemo: "Пожертвование от 08.10, пришло с опозданием",
    });

    const stored = await getDb().ledgerTransaction.findUniqueOrThrow({
      where: { id: result.transactionId },
    });
    expect(stored.occurredAt).toEqual(paidInClosedMonth);
    expect(stored.postedAt.getTime()).toBeGreaterThanOrEqual(now.getTime());
  });

  it("rejects overlapping reports", async () => {
    await expect(
      getDb().monthlyReport.create({
        data: { period: "2026-11", periodStart: at(12), periodEnd: at(48) },
      }),
    ).rejects.toThrow(/MonthlyReport_no_overlap/);
  });

  it("closes the month for postings that started before its end", async () => {
    // The draft "2026-10" now ends in a moment.
    const periodEnd = new Date((await dbNow()).getTime() + 1_500);
    await getDb().monthlyReport.update({
      where: { period: "2026-10" },
      data: { periodEnd },
    });

    // A posts before the end and stays open.
    const inputA = donation(need, 15_000);
    const aPosted = signal<{ transactionId: string; postedAt: Date }>();
    const aMayCommit = signal();
    const a = getDb().$transaction(
      async (tx) => {
        aPosted.resolve(await post(tx, inputA));
        await aMayCommit.promise;
      },
      { timeout: 20_000 },
    );

    // B starts before the end too, but posts only after the publication.
    const inputB = donation(need, 7_000);
    const bStarted = signal<Date>();
    const bMayPost = signal();
    const b = getDb().$transaction(
      async (tx) => {
        const [row] = await tx.$queryRaw<{ startedAt: Date }[]>`
          SELECT transaction_timestamp() AS "startedAt"`;
        bStarted.resolve(row!.startedAt);
        await bMayPost.promise;
        return post(tx, inputB);
      },
      { timeout: 20_000 },
    );

    const posted = await aPosted.promise;
    expect(posted.postedAt.getTime()).toBeLessThan(periodEnd.getTime());
    expect((await bStarted.promise).getTime()).toBeLessThan(
      periodEnd.getTime(),
    );

    await waitUntilPast(periodEnd);
    let published = false;
    const publication = getDb()
      .monthlyReport.update({
        where: { period: "2026-10" },
        data: { status: "PUBLISHED" },
      })
      .then(() => (published = true));
    // The publication waits for A, which holds the period lock.
    await waitForLockWaiter("ExclusiveLock");
    expect(published).toBe(false);

    // B's posting queues behind the publication.
    bMayPost.resolve();
    await waitForLockWaiter("ShareLock");
    aMayCommit.resolve();
    await a;
    await publication;

    await expect(b).rejects.toThrow(CLOSED);
    // A committed before the month closed: it's part of that month.
    expect(await transactionsWithKey(inputA.idempotencyKey)).toHaveLength(1);
    expect(await transactionsWithKey(inputB.idempotencyKey)).toEqual([]);

    // Postings from now on fall after the closed month.
    expect((await donate(need, 3_000)).created).toBe(true);
    // A transaction of the closed month is reversed in the current one.
    const reversal = await getDb().$transaction((tx) =>
      reverse(tx, posted.transactionId, "Банк отменил платёж"),
    );
    expect(reversal.postedAt.getTime()).toBeGreaterThanOrEqual(
      periodEnd.getTime(),
    );
  });

  it("keeps a published report final", async () => {
    const db = getDb();

    await expect(
      db.monthlyReport.update({
        where: { period: "2026-10" },
        data: { status: "DRAFT" },
      }),
    ).rejects.toThrow(FINAL);
    await expect(
      db.monthlyReport.update({
        where: { period: "2026-10" },
        data: { periodEnd: at(48) },
      }),
    ).rejects.toThrow(FINAL);
    await expect(
      db.monthlyReport.delete({ where: { period: "2026-10" } }),
    ).rejects.toThrow(FINAL);
    await expect(db.$executeRaw`TRUNCATE "MonthlyReport"`).rejects.toThrow(
      /ledger: TRUNCATE on "MonthlyReport" is forbidden/,
    );

    // Only updatedAt may change.
    expect(
      await db.$executeRaw`
        UPDATE "MonthlyReport" SET "updatedAt" = now() WHERE "period" = '2026-10'`,
    ).toBe(1);
  });
});
