import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import { seedDatabase } from "@/server/db/seed";
import { getSetting, setSetting } from "@/server/settings";
import { defaultSettings } from "@/server/settings/schema";

// Tests in a file share the database: start each one without an owner.
beforeEach(async () => {
  await getDb().user.updateMany({
    where: { role: "OWNER" },
    data: { role: "ADMIN" },
  });
});

describe("seedDatabase", () => {
  it("creates the owner and default settings, and is safe to run again", async () => {
    const db = getDb();
    const options = { ownerEmail: "owner@example.ru", timeZone: "Asia/Omsk" };

    expect(await seedDatabase(db, options)).toEqual({
      owner: "created",
      settingsCreated: Object.keys(defaultSettings("UTC")).length,
    });
    expect(
      await db.user.findUniqueOrThrow({ where: { email: "owner@example.ru" } }),
    ).toMatchObject({ role: "OWNER", emailVerified: true });
    expect(await getSetting(db, "shelter.timezone")).toBe("Asia/Omsk");

    // An admin edits a setting; the next seed must keep it.
    await setSetting(db, "shelter.timezone", "Europe/Moscow");

    expect(await seedDatabase(db, options)).toEqual({
      owner: "unchanged",
      settingsCreated: 0,
    });
    expect(await db.user.count({ where: { email: "owner@example.ru" } })).toBe(
      1,
    );
    expect(await getSetting(db, "shelter.timezone")).toBe("Europe/Moscow");
  });

  it("makes an existing user the owner while there is none", async () => {
    const db = getDb();
    await db.user.create({
      data: { email: "director@example.ru", name: "Ирина" },
    });

    const result = await seedDatabase(db, {
      ownerEmail: "director@example.ru",
      timeZone: "Europe/Moscow",
    });

    expect(result.owner).toBe("promoted");
    expect(
      await db.user.findUniqueOrThrow({
        where: { email: "director@example.ru" },
      }),
    ).toMatchObject({ role: "OWNER", name: "Ирина" });
  });

  it("leaves roles alone once the database has an owner", async () => {
    const db = getDb();
    await db.user.create({
      data: { email: "new-owner@example.ru", name: "Анна", role: "OWNER" },
    });
    // The previous owner, demoted in the admin, is still in SEED_OWNER_EMAIL.
    await db.user.create({
      data: { email: "former@example.ru", name: "Олег", role: "ADMIN" },
    });

    const result = await seedDatabase(db, {
      ownerEmail: "former@example.ru",
      timeZone: "Europe/Moscow",
    });

    expect(result.owner).toBe("unchanged");
    expect(
      await db.user.findUniqueOrThrow({
        where: { email: "former@example.ru" },
      }),
    ).toMatchObject({ role: "ADMIN" });
  });

  it("refuses to make a deleted user the owner", async () => {
    const db = getDb();
    await db.user.create({
      data: {
        email: "gone@example.ru",
        name: "Пётр",
        deletedAt: new Date("2026-01-01T00:00:00Z"),
      },
    });

    await expect(
      seedDatabase(db, {
        ownerEmail: "gone@example.ru",
        timeZone: "Europe/Moscow",
      }),
    ).rejects.toThrow("SEED_OWNER_EMAIL belongs to a deleted user");
    expect(
      await db.user.findUniqueOrThrow({ where: { email: "gone@example.ru" } }),
    ).toMatchObject({ role: "DONOR" });
  });
});
