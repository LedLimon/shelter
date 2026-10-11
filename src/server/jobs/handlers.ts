// What the worker runs: a handler for every job of ./definitions.ts and every
// outbox event of ./outbox/events.ts. Only the worker process imports this
// module, so handlers are free to import any domain code.
//
// A handler may run more than once for the same job or event (a retry, a
// worker killed mid-run): make it idempotent. It gets ids and loads the rest
// itself; what it throws is logged and stored, so no personal data in errors.
import { sendTestEmail } from "@/server/email/test-email";
import type { Mailer } from "@/server/email/transport";
import {
  cleanupMedia,
  processMedia,
  purgeMediaFiles,
} from "@/server/media/jobs";
import { jobIdOf, type JobHandlers } from "./boss";
import type { OutboxHandlers } from "./outbox/dispatcher";

export const jobHandlers: JobHandlers = {
  noop: () => Promise.resolve(),
  "media.process": ({ mediaId }, { signal }) => processMedia(mediaId, signal),
  "media.cleanup": async () => {
    await cleanupMedia();
  },
};

export type OutboxDependencies = {
  /** sendJob() of the worker's pg-boss instance. */
  sendJob: (
    name: string,
    payload: unknown,
    options: { id: string },
  ) => Promise<unknown>;
  /** Sends the letters; the process's SMTP client by default. */
  mailer?: Mailer;
};

// A handler that sends a letter loads the address and the data by the ids in
// its payload and calls sendEmail() with its context: one letter per event,
// however many times the event runs (docs/architecture.md#письма).
export function outboxHandlers({
  sendJob,
  mailer,
}: OutboxDependencies): OutboxHandlers {
  return {
    noop: () => Promise.resolve(),
    "job.run": async ({ name, payload }, { eventId }) => {
      await sendJob(name, payload, { id: jobIdOf(eventId) });
    },
    "email.test": (payload, context) =>
      sendTestEmail(payload, context, { mailer }),
    "media.purge": ({ mediaId, storageKey }, { signal }) =>
      purgeMediaFiles(mediaId, storageKey, signal),
  };
}
