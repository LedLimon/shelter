// pg-boss: the queues and schedules behind the jobs of ./definitions.ts. Only
// the worker process imports this module; the app reaches jobs through the
// outbox (enqueueJob()), so it needs neither pg-boss nor its schema.
import { createHash } from "node:crypto";
// eslint-disable-next-line no-restricted-imports -- the one module that talks to pg-boss
import {
  PgBoss,
  type ConstructorOptions,
  type JobWithMetadata,
  type Queue,
} from "pg-boss";
import {
  DEFAULT_QUEUE,
  jobs,
  type JobDefinition,
  type JobName,
  type JobPayload,
} from "./definitions";
import { describeError, describeMessage } from "./errors";
import type { Logger } from "./log";

/** pg-boss keeps its tables in a schema of its own, next to Prisma's `public`. */
export const JOBS_SCHEMA = "pgboss";

export type { PgBoss };
export type BossOptions = Partial<ConstructorOptions>;

/** The pg-boss queue options a job may set. */
export type QueueSettings = Pick<
  Queue,
  | "policy"
  | "retryLimit"
  | "retryDelay"
  | "retryBackoff"
  | "retryDelayMax"
  | "expireInSeconds"
  | "heartbeatSeconds"
>;

export type JobContext = {
  /** The pg-boss job's id: the same on every attempt. */
  jobId: string;
  /** 1 on the first run. */
  attempt: number;
  /** Aborted when the run expires: pass it to network calls. */
  signal: AbortSignal;
};

export type JobHandler<N extends JobName> = (
  payload: JobPayload<N>,
  context: JobContext,
) => Promise<void>;

export type JobHandlers = { [N in JobName]: JobHandler<N> };

// Loosely typed twins of `jobs` and JobHandlers, for tests that register
// jobs of their own.
type Definitions = Record<string, JobDefinition>;
type Handlers = Record<
  string,
  (payload: never, context: JobContext) => unknown
>;

/**
 * A pg-boss instance on the app's database. start() creates the schema, and
 * migrates it after a pg-boss upgrade, so the worker's database role needs
 * CREATE on the database (or the schema made for it in advance).
 */
export function createBoss(
  connectionString: string,
  logger: Logger = console,
  options: BossOptions = {},
): PgBoss {
  const boss = new PgBoss({
    connectionString,
    schema: JOBS_SCHEMA,
    ...options,
  });
  // Node turns an "error" event nobody listens to into an uncaught exception.
  // While the database is down every worker's every poll emits one: the same
  // text is logged once a minute.
  const lastLogged = new Map<string, number>();
  boss.on("error", (error: BossError) => {
    const text = `[jobs] pg-boss${error.queue ? ` (${error.queue})` : ""}: ${describeMessage(String(error.message))}`;
    const now = Date.now();
    if (now - (lastLogged.get(text) ?? 0) < ERROR_LOG_INTERVAL_MS) return;
    if (lastLogged.size >= 100) lastLogged.clear();
    lastLogged.set(text, now);
    logger.error(text);
  });
  boss.on("warning", ({ message }) => {
    logger.warn(`[jobs] pg-boss: ${describeMessage(message)}`);
  });
  return boss;
}

// What the "error" event carries is typed as an Error, but pg-boss emits a
// copy, `{ ...error, message, stack, queue?, worker? }`: not an instance.
type BossError = { message?: unknown; queue?: string };

const ERROR_LOG_INTERVAL_MS = 60_000;

export type RegisterOptions = {
  handlers: Handlers;
  /** Schedules are read in this zone: the shelter's. */
  timeZone: string;
  logger?: Logger;
  definitions?: Definitions;
  /** How often an idle worker looks for jobs; pg-boss's 2 s by default. */
  pollingIntervalSeconds?: number;
};

/**
 * Makes the started pg-boss instance work every job: a queue with the job's
 * settings, a worker with its handler, a schedule if it has one. Schedules
 * of jobs that no longer have one are removed.
 */
export async function registerJobs(
  boss: PgBoss,
  options: RegisterOptions,
): Promise<void> {
  const { handlers, timeZone, logger = console } = options;
  const definitions: Definitions = options.definitions ?? jobs;
  const scheduled = new Set<string>();

  for (const [name, definition] of Object.entries(definitions)) {
    const handler = handlers[name];
    if (!handler) throw new Error(`job "${name}" has no handler`);

    const { policy, retryDelayMax, ...settings } = {
      ...DEFAULT_QUEUE,
      ...definition.queue,
    };
    // pg-boss takes a cap on the delay only together with the backoff.
    const cap = settings.retryBackoff ? retryDelayMax : undefined;
    // createQueue() leaves an existing queue as it is; updateQueue() then
    // brings its settings in line with the code (all but the policy).
    await boss.createQueue(name, {
      policy,
      ...settings,
      ...(cap !== undefined && { retryDelayMax: cap }),
    });
    await boss.updateQueue(name, {
      ...settings,
      retryDelayMax: cap ?? null,
      heartbeatSeconds: settings.heartbeatSeconds ?? null,
    });
    const queue = await boss.getQueue(name);
    if (queue && queue.policy !== (policy ?? "standard")) {
      logger.warn(
        `[jobs] ${name}: the queue keeps its policy "${queue.policy}", ` +
          `the code asks for "${policy ?? "standard"}". pg-boss can't ` +
          "change it: delete the queue or rename the job",
      );
    }

    if (definition.schedule) {
      const { cron, payload, missed = "once" } = definition.schedule;
      // A payload the job would reject fails the start, not the 4 am run.
      const data = definition.payload.parse(payload ?? {}) as object;
      await boss.schedule(name, cron, data, { tz: timeZone, missed });
      scheduled.add(name);
    }

    await boss.work(
      name,
      {
        includeMetadata: true,
        localConcurrency: definition.concurrency ?? 1,
        // pg-boss rejects an explicit undefined.
        ...(options.pollingIntervalSeconds !== undefined && {
          pollingIntervalSeconds: options.pollingIntervalSeconds,
        }),
      },
      async ([job]) => {
        if (job) await runJob(job, definition, handler, logger);
      },
    );
  }

  for (const { name, key } of await boss.getSchedules()) {
    if (!scheduled.has(name)) await boss.unschedule(name, key);
  }
}

async function runJob(
  job: JobWithMetadata<unknown>,
  definition: JobDefinition,
  handler: Handlers[string],
  logger: Logger,
): Promise<void> {
  const attempt = job.retryCount + 1;
  const label = `[jobs] ${job.name} ${job.id}`;
  const logFailure = (failure: string) => {
    if (job.retryCount >= job.retryLimit) {
      logger.error(`${label}: FAILED after ${attempt} attempts: ${failure}`);
    } else {
      logger.warn(
        `${label}: attempt ${attempt} of ${job.retryLimit + 1} failed, ` +
          `will be retried: ${failure}`,
      );
    }
  };
  // pg-boss aborts the signal when it takes the job away from a handler
  // that is still running, and has by then failed the attempt itself. Left
  // unlogged, a job that ran over its time four times would read as done.
  const onAbort = () => {
    logFailure(
      `cut off while running: it ran over ${job.expireInSeconds} s, ` +
        "or the worker is stopping",
    );
  };
  job.signal.addEventListener("abort", onAbort, { once: true });

  try {
    const payload = definition.payload.parse(job.data);
    await handler(payload as never, {
      jobId: job.id,
      attempt,
      signal: job.signal,
    });
    // Aborted: the outcome is already logged and no longer the handler's.
    if (!job.signal.aborted) logger.info(`${label}: done (attempt ${attempt})`);
  } catch (error) {
    const failure = describeError(error);
    if (!job.signal.aborted) logFailure(failure);
    // pg-boss stores what is thrown as the job's output, message and stack:
    // the described error holds no personal data, the original might.
    throw new Error(failure);
  } finally {
    // pg-boss also aborts the signal after a handler that returned.
    job.signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Puts a job on its queue; returns the pg-boss job id, or null if a job with
 * `id` already exists. From the worker process only: the app calls
 * enqueueJob(), which gets here through the outbox.
 */
export async function sendJob(
  boss: PgBoss,
  name: string,
  payload: unknown,
  options: { id?: string } = {},
): Promise<string | null> {
  if (!Object.hasOwn(jobs, name)) throw new Error(`unknown job "${name}"`);
  const data = jobs[name as JobName].payload.parse(payload);
  return boss.send(name, data, options);
}

/**
 * The pg-boss job id (a UUID) for a "job.run" outbox event. Derived from the
 * event's id, so an event delivered twice still starts one job.
 */
export function jobIdOf(eventId: string): string {
  const hex = createHash("sha256").update(`job.run:${eventId}`).digest("hex");
  // Shaped as a version 5 (name-based) UUID.
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}
