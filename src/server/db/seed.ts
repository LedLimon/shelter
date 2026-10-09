import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { defaultSettings } from "@/server/settings/schema";

export type SeedOptions = {
  /** Lowercased, as the seed env schema returns it. */
  ownerEmail: string;
  timeZone: string;
};

export type SeedResult = {
  /**
   * created — a new owner; promoted — an existing user became the owner;
   * unchanged — the database already has an owner, roles were not touched.
   */
  owner: "created" | "promoted" | "unchanged";
  settingsCreated: number;
};

/**
 * Base data every environment needs: an owner and default settings. Safe to
 * run again: it adds what's missing and never overwrites what admins changed.
 */
export async function seedDatabase(
  db: PrismaClient,
  { ownerEmail, timeZone }: SeedOptions,
): Promise<SeedResult> {
  return db.$transaction(async (tx) => {
    const owner = await bootstrapOwner(tx, ownerEmail);

    const { count } = await tx.setting.createMany({
      data: Object.entries(defaultSettings(timeZone)).map(([key, value]) => ({
        key,
        value,
      })),
      skipDuplicates: true,
    });

    return { owner, settingsCreated: count };
  });
}

/**
 * Only while the database has no active owner: then the user with this email
 * becomes one. After that roles change in the admin, with an audit record,
 * so a later seed can't hand OWNER back to someone who was demoted.
 */
async function bootstrapOwner(
  tx: Prisma.TransactionClient,
  email: string,
): Promise<SeedResult["owner"]> {
  const owners = await tx.user.count({
    where: { role: "OWNER", deletedAt: null },
  });
  if (owners > 0) return "unchanged";

  const user = await tx.user.findUnique({ where: { email } });
  if (user?.deletedAt) {
    throw new Error(
      "SEED_OWNER_EMAIL belongs to a deleted user; set another email.",
    );
  }
  if (user) {
    await tx.user.update({ where: { email }, data: { role: "OWNER" } });
    return "promoted";
  }

  await tx.user.create({
    data: { email, emailVerified: true, name: "Владелец", role: "OWNER" },
  });
  return "created";
}
