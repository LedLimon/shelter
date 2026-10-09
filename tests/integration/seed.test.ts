import { beforeEach, describe, expect, it } from "vitest";
import { getAuth } from "@/server/auth";
import { adminAccessOf } from "@/server/auth/access";
import { getDb } from "@/server/db";
import { seedDatabase } from "@/server/db/seed";
import { getSetting, setSetting } from "@/server/settings";
import { defaultSettings } from "@/server/settings/schema";
import { totp } from "../support/totp";
import { Browser } from "./support/auth";

const OWNER_PASSWORD = "seed owner password";
const TOTP_SECRET = "seed-totp-secret-0123456789abcdef";

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
      ownerPassword: "none",
      ownerTotp: "none",
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
      ownerPassword: "none",
      ownerTotp: "none",
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

  it("gives the owner a password and a dev TOTP they can sign in with", async () => {
    const db = getDb();
    const ownerCredentials = {
      auth: getAuth(),
      password: OWNER_PASSWORD,
      totpSecret: TOTP_SECRET,
    };

    const result = await seedDatabase(db, {
      ownerEmail: "signin@example.ru",
      timeZone: "Europe/Moscow",
      ownerCredentials,
    });

    expect(result).toMatchObject({
      owner: "created",
      ownerPassword: "set",
      ownerTotp: "set",
    });
    const browser = new Browser();
    const signedIn = await browser.post("/sign-in/email", {
      email: "signin@example.ru",
      password: OWNER_PASSWORD,
    });
    expect(signedIn.json.twoFactorRedirect).toBe(true);
    await browser.post("/two-factor/verify-totp", { code: totp(TOTP_SECRET) });
    expect(adminAccessOf(await browser.session()).status).toBe("granted");
  });

  it("never overwrites the owner's password or authenticator", async () => {
    const db = getDb();
    await seedDatabase(db, {
      ownerEmail: "keeps@example.ru",
      timeZone: "Europe/Moscow",
      ownerCredentials: {
        auth: getAuth(),
        password: OWNER_PASSWORD,
        totpSecret: TOTP_SECRET,
      },
    });
    const before = await db.account.findFirstOrThrow({
      where: { user: { email: "keeps@example.ru" } },
    });
    const twoFactorBefore = await db.twoFactor.findFirstOrThrow({
      where: { user: { email: "keeps@example.ru" } },
    });

    const result = await seedDatabase(db, {
      ownerEmail: "keeps@example.ru",
      timeZone: "Europe/Moscow",
      ownerCredentials: {
        auth: getAuth(),
        password: "another password!",
        totpSecret: "another-totp-secret-0123456789",
      },
    });

    expect(result).toMatchObject({
      owner: "unchanged",
      ownerPassword: "kept",
      ownerTotp: "kept",
    });
    expect(
      await db.account.findFirstOrThrow({
        where: { user: { email: "keeps@example.ru" } },
      }),
    ).toMatchObject({ password: before.password });
    expect(
      await db.twoFactor.findFirstOrThrow({
        where: { user: { email: "keeps@example.ru" } },
      }),
    ).toMatchObject({ secret: twoFactorBefore.secret });
  });

  it("doesn't touch the sign-in of a demoted SEED_OWNER_EMAIL", async () => {
    const db = getDb();
    await db.user.create({
      data: { email: "boss@example.ru", name: "Анна", role: "OWNER" },
    });
    const former = await db.user.create({
      data: { email: "was-owner@example.ru", name: "Олег", role: "ADMIN" },
    });

    const result = await seedDatabase(db, {
      ownerEmail: "was-owner@example.ru",
      timeZone: "Europe/Moscow",
      ownerCredentials: {
        auth: getAuth(),
        password: OWNER_PASSWORD,
        totpSecret: TOTP_SECRET,
      },
    });

    expect(result).toMatchObject({
      owner: "unchanged",
      ownerPassword: "skipped",
      ownerTotp: "skipped",
    });
    expect(await db.account.count({ where: { userId: former.id } })).toBe(0);
    expect(
      await db.user.findUniqueOrThrow({ where: { id: former.id } }),
    ).toMatchObject({ twoFactorEnabled: false });
  });
});
