// Postgres of the integration tests defaults to Europe/Moscow (./setup/postgres.ts).
// adapter-pg assumes UTC sessions; createPrismaClient() pins them.
// eslint-disable-next-line no-restricted-imports -- the control: a client without the UTC pin
import { PrismaPg } from "@prisma/adapter-pg";
import { describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/lib/env";
import { getDb } from "@/server/db";
import { createPrismaClient } from "@/server/db/client";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const OCTOBER = new Date("2026-10-01T00:00:00.000Z");

async function sessionZone(db: PrismaClient): Promise<string | undefined> {
  const [row] = await db.$queryRaw<{ zone: string }[]>`
    SELECT current_setting('TimeZone') AS zone`;
  return row?.zone;
}

/** The instant Postgres takes a Date parameter for, as an ISO string. */
async function received(db: PrismaClient, value: Date): Promise<string> {
  const [row] = await db.$queryRaw<{ iso: string }[]>`
    SELECT to_char(${value}::timestamptz AT TIME ZONE 'UTC',
                   'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS iso`;
  return row?.iso ?? "";
}

/** How far now() read through the client is from the clock of this process. */
async function nowSkew(db: PrismaClient): Promise<number> {
  const [row] = await db.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
  return (row?.now.getTime() ?? Number.NaN) - Date.now();
}

describe("Postgres of the integration tests", () => {
  it("defaults to Europe/Moscow, where adapter-pg alone shifts times", async () => {
    const unpinned = new PrismaClient({
      adapter: new PrismaPg({ connectionString: getEnv().DATABASE_URL }),
    });
    try {
      expect(await sessionZone(unpinned)).toBe("Europe/Moscow");
      // Written 3 hours early: October would start in September.
      expect(await received(unpinned, OCTOBER)).toBe(
        "2026-09-30T21:00:00.000Z",
      );
      // Read 3 hours late.
      expect(Math.abs((await nowSkew(unpinned)) - 3 * HOUR)).toBeLessThan(
        MINUTE,
      );
    } finally {
      await unpinned.$disconnect();
    }
  });
});

describe("createPrismaClient()", () => {
  it("pins the session to UTC", async () => {
    expect(await sessionZone(getDb())).toBe("UTC");
  });

  it("writes a Date as the same instant", async () => {
    expect(await received(getDb(), OCTOBER)).toBe(OCTOBER.toISOString());
  });

  it("reads now() as the current time", async () => {
    expect(Math.abs(await nowSkew(getDb()))).toBeLessThan(MINUTE);
  });

  it("compares times set by Postgres with Date parameters", async () => {
    // Like ledger balance(db, id, at) and closed months: postedAt is
    // transaction_timestamp(), `at` and period bounds come from the app.
    const db = getDb();
    await db.$executeRaw`
      INSERT INTO "User" ("id", "email", "name", "createdAt", "updatedAt")
      VALUES ('timezone-test', 'timezone@example.ru', 'Пояс', now(), now())`;

    const createdBefore = (at: Date) =>
      db.user.count({ where: { createdAt: { lt: at } } });
    expect(await createdBefore(new Date(Date.now() + MINUTE))).toBe(1);
    expect(await createdBefore(new Date(Date.now() - MINUTE))).toBe(0);
  });

  it("keeps the options of the URL, and UTC wins over their TimeZone", async () => {
    const url = new URL(getEnv().DATABASE_URL);
    url.searchParams.set(
      "options",
      "-c statement_timeout=4321 -c TimeZone=Asia/Vladivostok",
    );
    url.searchParams.set("application_name", "shelter-timezone-test");

    const db = createPrismaClient(url.href);
    try {
      const [row] = await db.$queryRaw<Record<string, string>[]>`
        SELECT current_setting('TimeZone') AS "zone",
               current_setting('statement_timeout') AS "statementTimeout",
               current_setting('application_name') AS "applicationName"`;
      expect(row).toEqual({
        zone: "UTC",
        statementTimeout: "4321ms",
        applicationName: "shelter-timezone-test",
      });
    } finally {
      await db.$disconnect();
    }
  });
});
