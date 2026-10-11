// The app's clock and calendar against times set by Postgres (postedAt is
// transaction_timestamp()), on a server in Europe/Moscow (../setup/postgres.ts).
// The other ledger tests take their times from the database through the same
// client, so a session outside UTC would shift both sides and go unnoticed.
import { describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import { balance } from "@/server/ledger";
import { donate, newNeedAccount } from "./helpers";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
// How far the clocks of this process and of the container may differ (Docker
// Desktop's drifts after sleep). Still well under the 3-hour shift.
const SKEW = 30 * MINUTE;
const fromNow = (ms: number) => new Date(Date.now() + ms);

describe("ledger times against the app's clock", () => {
  it("returns postedAt as the current time", async () => {
    const { postedAt } = await donate(await newNeedAccount(), 10_000);

    expect(Math.abs(postedAt.getTime() - Date.now())).toBeLessThan(SKEW);
  });

  it("stores occurredAt as the instant the app passed", async () => {
    const { transactionId } = await donate(await newNeedAccount(), 10_000, {
      occurredAt: fromNow(-HOUR),
    });

    const [row] = await getDb().$queryRaw<{ lag: number }[]>`
      SELECT extract(epoch FROM "postedAt" - "occurredAt")::float8 * 1000 AS lag
        FROM "LedgerTransaction"
       WHERE "id" = ${transactionId}`;
    expect(Math.abs((row?.lag ?? Number.NaN) - HOUR)).toBeLessThan(SKEW);
  });

  it("balance(at) counts what was posted before `at`", async () => {
    const need = await newNeedAccount();
    await donate(need, 10_000);

    expect(await balance(getDb(), need, fromNow(SKEW))).toBe(10_000);
    expect(await balance(getDb(), need, fromNow(-SKEW))).toBe(0);
  });

  it("puts a posting into the month that contains it", async () => {
    const db = getDb();
    const need = await newNeedAccount();
    await db.monthlyReport.create({
      data: {
        period: "2026-10",
        periodStart: fromNow(-SKEW),
        periodEnd: fromNow(HOUR),
      },
    });
    await donate(need, 10_000);

    const [row] = await db.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count
        FROM "LedgerEntry" e
        JOIN "MonthlyReport" r
          ON e."postedAt" >= r."periodStart" AND e."postedAt" < r."periodEnd"
       WHERE r."period" = '2026-10' AND e."accountId" = ${need}`;
    expect(row?.count).toBe(1);
  });

  it("refuses to publish a month that isn't over", async () => {
    const db = getDb();
    // Ends in 2 hours: a session 3 hours ahead would take it as over.
    await db.monthlyReport.create({
      data: {
        period: "2026-11",
        periodStart: fromNow(HOUR),
        periodEnd: fromNow(2 * HOUR),
      },
    });

    await expect(
      db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(ledger_period_lock_key())`;
        await tx.monthlyReport.update({
          where: { period: "2026-11" },
          data: { status: "PUBLISHED" },
        });
      }),
    ).rejects.toThrow(/can't be published before/);
  });
});
