import type { Prisma } from "@/generated/prisma/client";
import type { Db } from "@/server/db";
import {
  outboxEvents,
  type OutboxEventType,
  type OutboxPayloadInput,
} from "./events";

export type EnqueueOptions = {
  /**
   * One event per key, for good: `donation.thanks:{donationId}`. A repeated
   * call (a webhook delivered twice, a retried action) writes nothing.
   */
  dedupeKey?: string;
};

/**
 * Records a side effect to run after the caller's transaction commits: pass
 * the `tx` that writes the business data, and the event commits or rolls back
 * with it. The worker then runs the event's handler, at least once: a handler
 * that fails is retried, so handlers are idempotent.
 *
 * Returns the event's id, or null if `dedupeKey` is already taken.
 */
export async function enqueue<T extends OutboxEventType>(
  tx: Db,
  type: T,
  payload: OutboxPayloadInput<T>,
  options: EnqueueOptions = {},
): Promise<string | null> {
  const data = outboxEvents[type].parse(payload) as Prisma.InputJsonObject;
  // Not create() with a caught P2002: a failed statement aborts the caller's
  // transaction (25P02 on its next query). ON CONFLICT DO NOTHING doesn't.
  const rows = await tx.outbox.createManyAndReturn({
    data: [{ type, payload: data, dedupeKey: options.dedupeKey }],
    select: { id: true },
    skipDuplicates: true,
  });
  return rows[0]?.id ?? null;
}
