import { z } from "zod";
// Types only: the app imports this module and must not load pg-boss.
import type { QueueSettings } from "./boss";

/**
 * A background job: a pg-boss queue of the same name, worked by the worker
 * process. Its handler is in ./handlers.ts.
 */
export type JobDefinition<Schema extends z.ZodType = z.ZodType> = {
  /**
   * Shape of the job's data. Ids only, like an outbox payload: no personal
   * data. Plain JSON in and out — no transforms, dates or coercion: the data
   * is parsed on every hop (enqueueJob, the outbox, the worker), each time
   * from the previous output.
   */
  payload: Schema;
  /** Runs the job on a schedule, besides enqueueJob(). */
  schedule?: {
    /**
     * Five fields, minute precision (`0 4 * * *`), in the shelter's time
     * zone. pg-boss also takes an RFC 5545 rule (`FREQ=MONTHLY;BYDAY=-1FR`).
     */
    cron: string;
    /** Data of a scheduled run; `{}` by default. */
    payload?: z.input<Schema>;
    /**
     * A run that came due while no worker was up (a deploy, an outage):
     * "once" runs it when a worker is back, "skip" drops it. "once" by
     * default: a nightly check missed is a check not done.
     */
    missed?: "once" | "skip";
  };
  /**
   * pg-boss queue options, on top of DEFAULT_QUEUE: retries, expiration,
   * `policy` (e.g. "singleton": one active run at a time). The policy can't
   * be changed once the queue exists.
   */
  queue?: QueueSettings;
  /** Runs in parallel per worker process; 1 by default. */
  concurrency?: number;
};

/**
 * A failed run is retried 3 times — 1–2, 2–4 and 4–8 minutes later (pg-boss
 * adds jitter) — then the job stays `failed`. A run that takes over 15
 * minutes counts as failed.
 */
export const DEFAULT_QUEUE = {
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: true,
  retryDelayMax: 3600,
  expireInSeconds: 900,
} satisfies QueueSettings;

// Keeps each job's own payload type, where `satisfies` alone would do too:
// the call reads as a declaration and checks `schedule.payload`.
function defineJob<Schema extends z.ZodType>(
  definition: JobDefinition<Schema>,
): JobDefinition<Schema> {
  return definition;
}

/**
 * Every background job by name. A new job: an entry here and its handler in
 * ./handlers.ts (TypeScript asks for it).
 */
export const jobs = {
  /** Does nothing: an example, and a check that the worker picks jobs up. */
  noop: defineJob({
    payload: z.object({ note: z.string().max(200).optional() }),
  }),
};

export type JobName = keyof typeof jobs;
/** What the handler receives. */
export type JobPayload<N extends JobName> = z.output<
  (typeof jobs)[N]["payload"]
>;
/** What enqueueJob() takes. */
export type JobPayloadInput<N extends JobName> = z.input<
  (typeof jobs)[N]["payload"]
>;
