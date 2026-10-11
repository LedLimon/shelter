import { spawnSync } from "node:child_process";

/**
 * Creates the e2e users (e2e/support/users.ts) and this run's fixtures in
 * the app's database.
 */
export default function globalSetup() {
  // Names what this run creates and can't reset afterwards (a withdrawn
  // consent stays withdrawn). Test workers start later and inherit it.
  process.env.E2E_RUN_ID ??= Date.now().toString(36);

  const result = spawnSync(
    "pnpm",
    ["exec", "tsx", "e2e/support/create-users.ts"],
    {
      stdio: "inherit",
      env: process.env,
    },
  );
  if (result.status !== 0) {
    throw new Error(
      "Couldn't create the e2e users. Is the database up and migrated " +
        "(pnpm dev:up, pnpm db:migrate) and BETTER_AUTH_SECRET set in .env?",
    );
  }
}
