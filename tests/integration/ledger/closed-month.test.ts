// Publishing a report is final, and the file's tests share a database: they
// run in order and the last ones close the "current" month for good. Periods
// are set around the database's clock, so the calendar date doesn't matter.
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import { balance, post } from "@/server/ledger";
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

let need: string;
let now: Date;

beforeAll(async () => {
  need = await newNeedAccount();
  now = await dbNow();
});

function report(period: string, from: number, to: number) {
  return {
    period,
    periodStart: new Date(now.getTime() + from * HOUR),
    periodEnd: new Date(now.getTime() + to * HOUR),
  };
}

describe("closed months", () => {
  it("posts while the month's report is a draft", async () => {
    await getDb().monthlyReport.create({ data: report("2026-10", -24, 24) });

    expect((await donate(need, 10_000)).created).toBe(true);
  });

  it("posts a late event of a closed month into the current one", async () => {
    await getDb().monthlyReport.create({
      data: { ...report("2026-09", -48, -24), status: "PUBLISHED" },
    });
    const paidInClosedMonth = new Date(now.getTime() - 36 * HOUR);

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
      getDb().monthlyReport.create({ data: report("2026-11", 12, 48) }),
    ).rejects.toThrow(/MonthlyReport_no_overlap/);
  });

  it("makes publication wait for a posting in flight", async () => {
    let posted!: () => void;
    const hasPosted = new Promise<void>((r) => (posted = r));
    let release!: () => void;
    const mayCommit = new Promise<void>((r) => (release = r));
    const input = donation(need, 5_000);

    const posting = getDb().$transaction(
      async (tx) => {
        await post(tx, input);
        posted();
        await mayCommit;
      },
      { timeout: 10_000 },
    );
    await hasPosted;

    let published = false;
    const publication = getDb()
      .monthlyReport.update({
        where: { period: "2026-10" },
        data: { status: "PUBLISHED" },
      })
      .then(() => (published = true));
    await sleep(300);
    expect(published).toBe(false);

    release();
    await posting;
    await publication;
    // Committed before the month closed: part of the published month.
    expect(await transactionsWithKey(input.idempotencyKey)).toHaveLength(1);
  });

  it("rejects posting into a month with a published report", async () => {
    const before = await balance(getDb(), need);
    const input = donation(need, 7_000);

    await expect(getDb().$transaction((tx) => post(tx, input))).rejects.toThrow(
      CLOSED,
    );
    expect(await transactionsWithKey(input.idempotencyKey)).toEqual([]);
    expect(await balance(getDb(), need)).toBe(before);
  });

  it("keeps a published report's month closed", async () => {
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
        data: { periodEnd: new Date(now.getTime() - 23 * HOUR) },
      }),
    ).rejects.toThrow(FINAL);
    await expect(
      db.monthlyReport.delete({ where: { period: "2026-10" } }),
    ).rejects.toThrow(FINAL);
    await expect(db.$executeRaw`TRUNCATE "MonthlyReport"`).rejects.toThrow(
      /ledger: TRUNCATE on "MonthlyReport" is forbidden/,
    );

    await expect(donate(need, 1_000)).rejects.toThrow(CLOSED);
  });
});
