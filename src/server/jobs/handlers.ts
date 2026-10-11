// What the worker runs: a handler for every job of ./definitions.ts and every
// outbox event of ./outbox/events.ts. Only the worker process imports this
// module, so handlers are free to import any domain code.
//
// A handler may run more than once for the same job or event (a retry, a
// worker killed mid-run): make it idempotent. It gets ids and loads the rest
// itself; what it throws is logged and stored, so no personal data in errors.
import { jobIdOf, type JobHandlers } from "./boss";
import type { OutboxHandlers } from "./outbox/dispatcher";

export const jobHandlers: JobHandlers = {
  noop: () => Promise.resolve(),
};

export type OutboxDependencies = {
  /** sendJob() of the worker's pg-boss instance. */
  sendJob: (
    name: string,
    payload: unknown,
    options: { id: string },
  ) => Promise<unknown>;
};

export function outboxHandlers({
  sendJob,
}: OutboxDependencies): OutboxHandlers {
  return {
    noop: () => Promise.resolve(),
    "job.run": async ({ name, payload }, { eventId }) => {
      await sendJob(name, payload, { id: jobIdOf(eventId) });
    },
  };
}
