import { z } from "zod";

/**
 * Every outbox event type and the shape of its payload: ids only, no personal
 * data — the handler loads emails and names itself. A new event: an entry
 * here and its handler in ../handlers.ts (TypeScript asks for it).
 *
 * Rows outlive deploys. A payload change must accept the rows already in the
 * table (`.optional()`, `.default()`), like a stored setting. Plain JSON in
 * and out — no transforms, dates or coercion: the payload is parsed when it
 * is enqueued and again, from what was stored, before the handler.
 */
export const outboxEvents = {
  /** Does nothing: an example, and a check that the worker is alive. */
  noop: z.object({ note: z.string().max(200).optional() }),
  /**
   * Starts a background job: written by enqueueJob(), which has checked the
   * payload against the job. The name stays a string here: a worker one
   * deploy behind retries a job it doesn't know yet instead of rejecting it.
   */
  "job.run": z.object({ name: z.string(), payload: z.unknown() }),
} satisfies Record<string, z.ZodType>;

export type OutboxEventType = keyof typeof outboxEvents;
/** What the handler receives. */
export type OutboxPayload<T extends OutboxEventType> = z.output<
  (typeof outboxEvents)[T]
>;
/** What enqueue() takes. */
export type OutboxPayloadInput<T extends OutboxEventType> = z.input<
  (typeof outboxEvents)[T]
>;
