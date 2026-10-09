import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { Auth } from "@/server/auth/config";
import { ensurePassword, ensureTotp } from "@/server/auth/credentials";
import { defaultSettings } from "@/server/settings/schema";

export type SeedOptions = {
  /** Lowercased, as the seed env schema returns it. */
  ownerEmail: string;
  timeZone: string;
  /** The owner's sign-in; without it the seed touches only roles and settings. */
  ownerCredentials?: {
    auth: Auth;
    /** Set only if the owner has no password yet. */
    password?: string;
    /** Dev and tests: TOTP with this secret, unless the owner already has it. */
    totpSecret?: string;
  };
};

/**
 * set — given by this run; kept — the owner already had it; none — the owner
 * still has none; skipped — SEED_OWNER_EMAIL is not the owner (demoted), so
 * its sign-in is not touched.
 */
export type CredentialResult = "set" | "kept" | "none" | "skipped";

export type SeedResult = {
  /**
   * created — a new owner; promoted — an existing user became the owner;
   * unchanged — the database already has an owner, roles were not touched.
   */
  owner: "created" | "promoted" | "unchanged";
  ownerPassword: CredentialResult;
  ownerTotp: CredentialResult;
  settingsCreated: number;
};

/**
 * Base data every environment needs: an owner who can sign in and default
 * settings. Safe to run again: it adds what's missing and never overwrites
 * what admins changed — roles, passwords, authenticators, settings.
 */
export async function seedDatabase(
  db: PrismaClient,
  { ownerEmail, timeZone, ownerCredentials }: SeedOptions,
): Promise<SeedResult> {
  return db.$transaction(async (tx) => {
    const owner = await bootstrapOwner(tx, ownerEmail);
    const credentials = await seedOwnerCredentials(
      tx,
      ownerEmail,
      ownerCredentials,
    );

    const { count } = await tx.setting.createMany({
      data: Object.entries(defaultSettings(timeZone)).map(([key, value]) => ({
        key,
        value,
      })),
      skipDuplicates: true,
    });

    return { owner, ...credentials, settingsCreated: count };
  });
}

async function seedOwnerCredentials(
  tx: Prisma.TransactionClient,
  email: string,
  credentials: SeedOptions["ownerCredentials"],
): Promise<Pick<SeedResult, "ownerPassword" | "ownerTotp">> {
  const user = await tx.user.findUnique({
    where: { email },
    select: {
      id: true,
      role: true,
      twoFactorEnabled: true,
      accounts: {
        where: { providerId: "credential" },
        select: { password: true },
      },
    },
  });
  // Another owner runs the shelter, or this one was demoted in the admin.
  if (user?.role !== "OWNER") {
    return { ownerPassword: "skipped", ownerTotp: "skipped" };
  }

  const hasPassword = user.accounts.some((account) => account.password);
  let ownerPassword: CredentialResult = hasPassword ? "kept" : "none";
  if (credentials?.password && !hasPassword) {
    await ensurePassword(credentials.auth, tx, user.id, credentials.password);
    ownerPassword = "set";
  }

  let ownerTotp: CredentialResult = user.twoFactorEnabled ? "kept" : "none";
  if (credentials?.totpSecret && !user.twoFactorEnabled) {
    await ensureTotp(credentials.auth, tx, user.id, credentials.totpSecret);
    ownerTotp = "set";
  }

  return { ownerPassword, ownerTotp };
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
