import type { PrismaClient } from "@/generated/prisma/client";
import { defaultSettings } from "@/server/settings/schema";

export type SeedOptions = {
  /** Lowercased, as the seed env schema returns it. */
  ownerEmail: string;
  timeZone: string;
};

export type SeedResult = {
  ownerCreated: boolean;
  settingsCreated: number;
};

/**
 * Base data every environment needs: the owner and default settings.
 * Safe to run again: it adds what's missing and never overwrites settings
 * admins have edited.
 */
export async function seedDatabase(
  db: PrismaClient,
  { ownerEmail, timeZone }: SeedOptions,
): Promise<SeedResult> {
  return db.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { email: ownerEmail },
      select: { id: true },
    });
    await tx.user.upsert({
      where: { email: ownerEmail },
      create: {
        email: ownerEmail,
        emailVerified: true,
        name: "Владелец",
        role: "OWNER",
      },
      update: { role: "OWNER" },
    });

    const { count } = await tx.setting.createMany({
      data: Object.entries(defaultSettings(timeZone)).map(([key, value]) => ({
        key,
        value,
      })),
      skipDuplicates: true,
    });

    return { ownerCreated: !existing, settingsCreated: count };
  });
}
