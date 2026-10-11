// Run by e2e/global-setup.ts with tsx (like the seed): creates the e2e users
// and resets their sign-in state, so every run starts the same.
import type { PrismaClient } from "@/generated/prisma/client";
import type { UserRole } from "@/generated/prisma/enums";
import { EnvValidationError, parseEnv, seedEnvSchema } from "@/lib/env/schema";
import { createAuth } from "@/server/auth/config";
import { ensurePassword, ensureTotp } from "@/server/auth/credentials";
import { createPrismaClient } from "@/server/db/client";
import {
  E2E_ATTEMPTS,
  E2E_PASSWORD,
  E2E_PROJECTS,
  E2E_TOTP_SECRET,
  E2E_USERS,
  LOCAL_EMAIL_DOMAIN,
  newStaffEmail,
} from "./users";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Known passwords must never reach a real database. A local host is not
 * proof (a tunnel to production is local too), so the database must also
 * have been seeded as a dev or test one: its owner is @shelter.localhost.
 */
async function assertTestDatabase(db: PrismaClient, url: string) {
  if (!LOCAL_HOSTS.has(new URL(url).hostname)) {
    throw new Error(
      "e2e users are created only in a local database (DATABASE_URL host).",
    );
  }
  const owners = await db.user.findMany({
    where: {
      role: "OWNER",
      deletedAt: null,
      NOT: { email: { startsWith: "e2e-" } },
    },
    select: { email: true },
  });
  if (owners.length === 0) {
    throw new Error("The database has no owner yet: run pnpm db:seed first.");
  }
  if (owners.some(({ email }) => !email.endsWith(LOCAL_EMAIL_DOMAIN))) {
    throw new Error(
      `The owner's email is not ${LOCAL_EMAIL_DOMAIN}, so this looks like a ` +
        "real database; e2e writes only to dev and test ones (SEED_OWNER_EMAIL).",
    );
  }
}

async function main() {
  const env = parseEnv(
    seedEnvSchema.pick({
      DATABASE_URL: true,
      APP_URL: true,
      BETTER_AUTH_SECRET: true,
    }),
    process.env,
    "e2e",
  );
  const db = createPrismaClient(env.DATABASE_URL);
  const auth = createAuth(db, {
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_URL,
  });

  async function user(email: string, role: UserRole, name: string) {
    const { id } = await db.user.upsert({
      where: { email },
      create: { email, name, role, emailVerified: true },
      update: { role, deletedAt: null },
    });
    await ensurePassword(auth, db, id, E2E_PASSWORD);
    return id;
  }

  try {
    await assertTestDatabase(db, env.DATABASE_URL);

    const ownerId = await user(E2E_USERS.owner, "OWNER", "Ирина (e2e)");
    await ensureTotp(auth, db, ownerId, E2E_TOTP_SECRET);
    // Wrong-code tests must not leave the owner locked for the next run.
    await db.twoFactor.update({
      where: { userId: ownerId },
      data: { failedVerificationCount: 0, lockedUntil: null },
    });

    await user(E2E_USERS.donor, "DONOR", "Донор (e2e)");

    for (const project of E2E_PROJECTS) {
      for (let retry = 0; retry < E2E_ATTEMPTS; retry += 1) {
        const id = await user(
          newStaffEmail(project, retry),
          "EDITOR",
          `Куратор (e2e, ${project})`,
        );
        // Back to the very first sign-in: no authenticator, no sessions.
        await db.twoFactor.deleteMany({ where: { userId: id } });
        await db.session.deleteMany({ where: { userId: id } });
        await db.user.update({
          where: { id },
          data: { twoFactorEnabled: false },
        });
      }
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof EnvValidationError ? error.message : error);
  process.exit(1);
});
