// The background worker: `pnpm worker`. One process runs the pg-boss jobs,
// their schedules and the outbox dispatcher (src/server/jobs); several may
// run side by side. Stops gracefully on SIGTERM and SIGINT.
import { existsSync } from "node:fs";
import { checkEnvOrExit } from "@/lib/env/check";
import { disconnectDb } from "@/server/db";
import { describeError } from "@/server/jobs/errors";
import { startWorker } from "@/server/jobs/worker";

async function main() {
  // Next.js loads .env by itself; outside it nothing does. Variables already
  // set in the environment win, and a container has no .env at all.
  if (existsSync(".env")) process.loadEnvFile(".env");
  checkEnvOrExit();
  const worker = await startWorker();

  let stopping = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (stopping) {
      // A second signal: the operator doesn't want to wait.
      console.error(`[worker] ${signal} again: exiting at once`);
      process.exit(1);
    }
    stopping = true;
    console.info(`[worker] ${signal}: finishing running work`);
    worker
      .stop()
      .then(disconnectDb)
      .then(
        () => process.exit(0),
        (error: unknown) => {
          console.error(`[worker] shutdown failed: ${describeError(error)}`);
          process.exit(1);
        },
      );
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error: unknown) => {
  // The database is down, the pgboss schema can't be created…: exit, and let
  // the supervisor (Docker's restart policy) start the worker again.
  console.error(`[worker] could not start: ${describeError(error)}`);
  process.exit(1);
});
