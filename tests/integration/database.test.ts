import { readdirSync } from "node:fs";
import { describe, expect, inject, it } from "vitest";
import { getDb } from "@/server/db";

const migrations = readdirSync(
  new URL("../../prisma/migrations", import.meta.url),
  { withFileTypes: true },
)
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe("test database", () => {
  it("is this file's own copy, not the template", async () => {
    const [row] = await getDb().$queryRaw<{ name: string }[]>`
      SELECT current_database() AS name`;
    const template = new URL(inject("templateDatabaseUrl")).pathname.slice(1);

    expect(row?.name).toMatch(/^test_[0-9a-f]{12}$/);
    expect(row?.name).not.toBe(template);
  });

  it("has every migration applied to a clean database", async () => {
    const applied = await getDb().$queryRaw<{ name: string }[]>`
      SELECT migration_name AS name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY migration_name`;

    expect(migrations.length).toBeGreaterThan(0);
    expect(applied.map((row) => row.name)).toEqual(migrations);
  });

  it("starts empty", async () => {
    const db = getDb();

    expect(await db.user.count()).toBe(0);
    expect(await db.setting.count()).toBe(0);
    expect(await db.media.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });
});

describe("User", () => {
  it("rejects an email that isn't lowercased", async () => {
    await expect(
      getDb().user.create({
        data: { email: "Owner@Example.ru", name: "Ольга" },
      }),
    ).rejects.toThrow(/User_email_lowercase/);
  });
});
