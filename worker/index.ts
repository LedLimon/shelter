// The background worker: `pnpm worker`. One process runs the pg-boss jobs,
// their schedules and the outbox dispatcher (src/server/jobs); several may
// run side by side. Stops gracefully on SIGTERM and SIGINT.
import { existsSync } from "node:fs";
import { checkEnvOrExit } from "@/lib/env/check";
import { disconnectDb } from "@/server/db";
import { describeError } from "@/server/jobs/errors";
import { SHUTDOWN_TIMEOUT_MS, startWorker } from "@/server/jobs/worker";

// A terminal's Ctrl+C reaches the process twice at once: the shell signals
// the whole foreground group, and pnpm and tsx pass theirs on. Only a signal
// after this pause is the operator asking again.
const REPEATED_SIGNAL_AFTER_MS = 2_000;
// Past the graceful timeout something is stuck (a hung database connection):
// exit before the supervisor's SIGKILL, with a line in the log.
const HARD_EXIT_AFTER_MS = SHUTDOWN_TIMEOUT_MS + 3_000;

async function main() {
  // Next.js loads .env by itself; outside it nothing does. Variables already
  // set in the environment win, and a container has no .env at all.
  if (existsSync(".env")) process.loadEnvFile(".env");
  checkEnvOrExit();
  const worker = await startWorker();

  let stoppingSince: number | undefined;
  const shutdown = (signal: NodeJS.Signals) => {
    if (stoppingSince !== undefined) {
      if (Date.now() - stoppingSince < REPEATED_SIGNAL_AFTER_MS) return;
      console.error(`[worker] ${signal} again: exiting at once`);
      process.exit(1);
    }
    stoppingSince = Date.now();
    console.info(`[worker] ${signal}: finishing running work`);
    setTimeout(() => {
      console.error("[worker] shutdown is stuck: exiting");
      process.exit(1);
    }, HARD_EXIT_AFTER_MS).unref();
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
