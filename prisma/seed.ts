// `pnpm db:seed` (prisma db seed) runs this with tsx; prisma.config.ts has
// already loaded .env.
import { EnvValidationError, parseEnv, seedEnvSchema } from "@/lib/env/schema";
import { createPrismaClient } from "@/server/db/client";
import { seedDatabase, type SeedResult } from "@/server/db/seed";

const OWNER_MESSAGES = {
  created: "owner created",
  promoted: "existing user made the owner",
  unchanged: "the database already has an owner, roles untouched",
} satisfies Record<SeedResult["owner"], string>;

async function main() {
  const env = parseEnv(seedEnvSchema, process.env, "seed");
  const db = createPrismaClient(env.DATABASE_URL);
  try {
    const result = await seedDatabase(db, {
      ownerEmail: env.SEED_OWNER_EMAIL,
      timeZone: env.SHELTER_TIMEZONE,
    });
    console.log(
      `Seed: ${OWNER_MESSAGES[result.owner]}; ` +
        `settings added: ${result.settingsCreated}.`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof EnvValidationError ? error.message : error);
  process.exit(1);
});
