import "server-only";
import { getEnv } from "@/lib/env";
import { getDb } from "@/server/db";
import { getSetting } from "@/server/settings";
import {
  createBoss,
  registerJobs,
  sendJob,
  type BossOptions,
  type RegisterOptions,
} from "./boss";
import { jobs } from "./definitions";
import { jobHandlers, outboxHandlers } from "./handlers";
import type { Logger } from "./log";
import {
  startOutboxDispatcher,
  type DispatcherOptions,
} from "./outbox/dispatcher";

// Docker waits 10 s between SIGTERM and SIGKILL unless told otherwise: the
// worker's container needs a stop_grace_period above this.
export const SHUTDOWN_TIMEOUT_MS = 25_000;

export type WorkerOptions = {
  logger?: Logger;
  /** Overrides, for tests. */
  jobs?: Partial<Omit<RegisterOptions, "logger" | "timeZone">>;
  outbox?: Partial<DispatcherOptions>;
  boss?: BossOptions;
};

export type Worker = {
  /**
   * Takes no new work and waits for what is running, `timeoutMs` at most.
   * Whatever is cut off then is retried by the next worker.
   */
  stop(timeoutMs?: number): Promise<void>;
};

/**
 * Starts background processing in this process: pg-boss with every job and
 * schedule, and the outbox dispatcher. Uses the process's getDb(); the caller
 * closes it after stop().
 */
export async function startWorker(
  options: WorkerOptions = {},
): Promise<Worker> {
  const logger = options.logger ?? console;
  const env = getEnv();
  const db = getDb();

  const boss = createBoss(env.DATABASE_URL, logger, options.boss);
  await boss.start();
  try {
    // Read once: a changed setting moves the schedules on the next start.
    const timeZone =
      (await getSetting(db, "shelter.timezone")) ?? env.SHELTER_TIMEZONE;
    await registerJobs(boss, {
      handlers: jobHandlers,
      timeZone,
      logger,
      ...options.jobs,
    });
  } catch (error) {
    await boss.stop({ graceful: false });
    throw error;
  }

  const dispatcher = startOutboxDispatcher(db, {
    handlers: outboxHandlers({
      sendJob: (name, payload, sendOptions) =>
        sendJob(boss, name, payload, sendOptions),
    }),
    logger,
    ...options.outbox,
  });

  const names = Object.keys(options.jobs?.definitions ?? jobs);
  logger.info(`[worker] started: outbox, jobs: ${names.join(", ")}`);

  return {
    async stop(timeoutMs = SHUTDOWN_TIMEOUT_MS) {
      // Both stop taking work now and share the time. pg-boss keeps its
      // pool open meanwhile: a "job.run" event still running sends its job.
      await Promise.all([
        dispatcher.stop(timeoutMs),
        boss.stop({ graceful: true, timeout: timeoutMs, close: false }),
      ]);
      // Stopped already: this call only closes the pool.
      await boss.stop();
      logger.info("[worker] stopped");
    },
  };
}
