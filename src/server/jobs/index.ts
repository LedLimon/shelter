import "server-only";

// Background work as the app sees it (docs/architecture.md#фоновые-задачи-worker):
//
//   await outbox.enqueue(tx, "donation.thanks", { donationId });
//   await enqueueJob(tx, "noop", {});
//
// Both write an Outbox row in the caller's transaction; the worker process
// (./worker.ts, `pnpm worker`) does the rest. Event types are declared in
// ./outbox/events.ts, jobs in ./definitions.ts, their handlers in
// ./handlers.ts.
export * as outbox from "./outbox";
export { enqueueJob } from "./enqueue-job";
export type { JobName, JobPayload, JobPayloadInput } from "./definitions";
