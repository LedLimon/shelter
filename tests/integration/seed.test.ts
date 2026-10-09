import { describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import { seedDatabase } from "@/server/db/seed";
import { getSetting, setSetting } from "@/server/settings";
import { defaultSettings } from "@/server/settings/schema";

describe("seedDatabase", () => {
  it("creates the owner and default settings, and is safe to run again", async () => {
    const db = getDb();
    const options = { ownerEmail: "owner@example.ru", timeZone: "Asia/Omsk" };

    expect(await seedDatabase(db, options)).toEqual({
      ownerCreated: true,
      settingsCreated: Object.keys(defaultSettings("UTC")).length,
    });
    const owner = await db.user.findUniqueOrThrow({
      where: { email: "owner@example.ru" },
    });
    expect(owner).toMatchObject({ role: "OWNER", emailVerified: true });
    expect(await getSetting(db, "shelter.timezone")).toBe("Asia/Omsk");

    // An admin edits a setting; the next seed must keep it.
    await setSetting(db, "shelter.timezone", "Europe/Moscow");

    expect(await seedDatabase(db, options)).toEqual({
      ownerCreated: false,
      settingsCreated: 0,
    });
    expect(await db.user.count()).toBe(1);
    expect(await getSetting(db, "shelter.timezone")).toBe("Europe/Moscow");
  });

  it("makes an existing user with the owner email the owner", async () => {
    const db = getDb();
    await db.user.create({
      data: { email: "director@example.ru", name: "Ирина", role: "DONOR" },
    });

    const result = await seedDatabase(db, {
      ownerEmail: "director@example.ru",
      timeZone: "Europe/Moscow",
    });

    expect(result.ownerCreated).toBe(false);
    expect(
      await db.user.findUniqueOrThrow({
        where: { email: "director@example.ru" },
      }),
    ).toMatchObject({ role: "OWNER", name: "Ирина" });
  });
});
