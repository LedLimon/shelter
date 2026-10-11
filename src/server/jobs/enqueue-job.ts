import type { Db } from "@/server/db";
import { jobs, type JobName, type JobPayloadInput } from "./definitions";
import { enqueue, type EnqueueOptions } from "./outbox/enqueue";

/**
 * Starts a background job after the caller's transaction commits (a manual
 * run from the admin, heavy work after a write). Goes through the outbox, as
 * a "job.run" event: the job is started if and only if `tx` commits, and the
 * app itself never talks to pg-boss.
 *
 * Returns the outbox event's id, or null if `dedupeKey` is already taken.
 */
export async function enqueueJob<N extends JobName>(
  tx: Db,
  name: N,
  payload: JobPayloadInput<N>,
  options: EnqueueOptions = {},
): Promise<string | null> {
  const data: unknown = jobs[name].payload.parse(payload);
  return enqueue(tx, "job.run", { name, payload: data }, options);
}
