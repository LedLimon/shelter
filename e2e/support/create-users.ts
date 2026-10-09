// Run by e2e/global-setup.ts with tsx (like the seed): creates the e2e users
// and resets their sign-in state, so every run starts the same.
import { EnvValidationError, parseEnv, seedEnvSchema } from "@/lib/env/schema";
import { createAuth } from "@/server/auth/config";
import { ensurePassword, ensureTotp } from "@/server/auth/credentials";
import { createPrismaClient } from "@/server/db/client";
import type { UserRole } from "@/generated/prisma/enums";
import {
  E2E_PASSWORD,
  E2E_PROJECTS,
  E2E_TOTP_SECRET,
  E2E_USERS,
  newStaffEmail,
} from "./users";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

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
  // Known passwords must never reach a shared database.
  if (!LOCAL_HOSTS.has(new URL(env.DATABASE_URL).hostname)) {
    throw new Error(
      "e2e users are created only in a local database (DATABASE_URL host).",
    );
  }

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
    const ownerId = await user(E2E_USERS.owner, "OWNER", "Ирина (e2e)");
    await ensureTotp(auth, db, ownerId, E2E_TOTP_SECRET);
    // Wrong-code tests must not leave the owner locked for the next run.
    await db.twoFactor.update({
      where: { userId: ownerId },
      data: { failedVerificationCount: 0, lockedUntil: null },
    });

    await user(E2E_USERS.donor, "DONOR", "Донор (e2e)");

    for (const project of E2E_PROJECTS) {
      const id = await user(
        newStaffEmail(project),
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
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof EnvValidationError ? error.message : error);
  process.exit(1);
});
