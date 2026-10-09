// `pnpm db:seed` (prisma db seed) runs this with tsx; prisma.config.ts has
// already loaded .env.
import { EnvValidationError, parseEnv, seedEnvSchema } from "@/lib/env/schema";
import { createAuth } from "@/server/auth/config";
import { createPrismaClient } from "@/server/db/client";
import {
  seedDatabase,
  type CredentialResult,
  type SeedResult,
} from "@/server/db/seed";

const OWNER_MESSAGES = {
  created: "owner created",
  promoted: "existing user made the owner",
  unchanged: "the database already has an owner, roles untouched",
} satisfies Record<SeedResult["owner"], string>;

const PASSWORD_MESSAGES = {
  set: "password set from SEED_OWNER_PASSWORD",
  kept: "password kept",
  none:
    "THE OWNER HAS NO PASSWORD and can't sign in: " +
    "set SEED_OWNER_PASSWORD and run the seed again",
  skipped: "SEED_OWNER_EMAIL is not the owner, sign-in untouched",
} satisfies Record<CredentialResult, string>;

const TOTP_MESSAGES = {
  set: "TOTP set from SEED_OWNER_TOTP_SECRET",
  kept: "TOTP kept",
  none: "TOTP is set up on the first sign-in",
  skipped: "",
} satisfies Record<CredentialResult, string>;

async function main() {
  const env = parseEnv(seedEnvSchema, process.env, "seed");
  // A known TOTP secret is a test fixture; in production the owner scans a
  // fresh one on the setup screen.
  if (env.SEED_OWNER_TOTP_SECRET && process.env.NODE_ENV === "production") {
    throw new Error(
      "SEED_OWNER_TOTP_SECRET is for dev and tests only; leave it empty in production.",
    );
  }

  const db = createPrismaClient(env.DATABASE_URL);
  try {
    const result = await seedDatabase(db, {
      ownerEmail: env.SEED_OWNER_EMAIL,
      timeZone: env.SHELTER_TIMEZONE,
      ownerCredentials: {
        auth: createAuth(db, {
          secret: env.BETTER_AUTH_SECRET,
          baseURL: env.APP_URL,
        }),
        password: env.SEED_OWNER_PASSWORD,
        totpSecret: env.SEED_OWNER_TOTP_SECRET,
      },
    });
    console.log(
      [
        `Seed: ${OWNER_MESSAGES[result.owner]}`,
        PASSWORD_MESSAGES[result.ownerPassword],
        TOTP_MESSAGES[result.ownerTotp],
        `settings added: ${result.settingsCreated}.`,
      ]
        .filter(Boolean)
        .join("; "),
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof EnvValidationError ? error.message : error);
  process.exit(1);
});
