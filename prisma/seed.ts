// `pnpm db:seed` (prisma db seed) runs this with tsx; prisma.config.ts has
// already loaded .env.
import { EnvValidationError, parseEnv, seedEnvSchema } from "@/lib/env/schema";
import { createPrismaClient } from "@/server/db/client";
import { seedDatabase } from "@/server/db/seed";

async function main() {
  const env = parseEnv(seedEnvSchema, process.env, "seed");
  const db = createPrismaClient(env.DATABASE_URL);
  try {
    const result = await seedDatabase(db, {
      ownerEmail: env.SEED_OWNER_EMAIL,
      timeZone: env.SHELTER_TIMEZONE,
    });
    console.log(
      `Seed: owner ${result.ownerCreated ? "created" : "already exists"}, ` +
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
