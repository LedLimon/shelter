import { spawnSync } from "node:child_process";

/** Creates the e2e users (e2e/support/users.ts) in the app's database. */
export default function globalSetup() {
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
