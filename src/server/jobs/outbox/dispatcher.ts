// The worker's side of the outbox: claims due events, runs their handlers,
// records the outcome. Several dispatchers (worker processes) may run at once.
//
// Delivery is at least once. An event is claimed by one dispatcher at a time,
// but a handler that did its work and then lost its claim — the process was
// killed, the handler outran its time — runs again. Handlers are idempotent.
import { setTimeout as sleep } from "node:timers/promises";
import type { PrismaClient } from "@/generated/prisma/client";
import { describeError } from "../errors";
import type { Logger } from "../log";
import { retryDelayMs } from "./backoff";
import {
  outboxEvents,
  type OutboxEventType,
  type OutboxPayload,
} from "./events";

export type OutboxContext = {
  /** Outbox.id: the same on every attempt, a key for idempotency. */
  eventId: string;
  /** 1 on the first run. */
  attempt: number;
  /** Aborted when the handler runs out of time: pass it to network calls. */
  signal: AbortSignal;
};

export type OutboxHandler<T extends OutboxEventType> = (
  payload: OutboxPayload<T>,
  context: OutboxContext,
) => Promise<void>;

export type OutboxHandlers = { [T in OutboxEventType]: OutboxHandler<T> };

export type DispatcherOptions = {
  handlers: OutboxHandlers;
  logger?: Logger;
  /** An event that failed this many times becomes FAILED. */
  maxAttempts?: number;
  /** Handlers running at once in this process. */
  concurrency?: number;
  /** How often an idle dispatcher looks for due events. */
  pollIntervalMs?: number;
  /** A handler that runs longer fails the attempt. */
  handlerTimeoutMs?: number;
  /** Delay before the next attempt, by the number of attempts made. */
  retryDelayMs?: (attempt: number) => number;
};

type Config = Required<DispatcherOptions>;

type ClaimedEvent = {
  id: string;
  type: string;
  payload: unknown;
  /** Including this one. */
  attempts: number;
};

// A claim outlives the handler's time limit by this much, so a slow handler
// is settled by its own dispatcher before another one may claim the event.
const LEASE_MARGIN_MS = 60_000;

function resolve(options: DispatcherOptions): Config {
  return {
    handlers: options.handlers,
    logger: options.logger ?? console,
    maxAttempts: options.maxAttempts ?? 10,
    concurrency: options.concurrency ?? 5,
    pollIntervalMs: options.pollIntervalMs ?? 1_000,
    handlerTimeoutMs: options.handlerTimeoutMs ?? 120_000,
    retryDelayMs: options.retryDelayMs ?? retryDelayMs,
  };
}

/**
 * Starts polling the outbox. stop() takes no new events and waits, up to
 * `timeoutMs`, for the handlers already running; an event still running after
 * that keeps its claim and is retried when the claim expires.
 */
export function startOutboxDispatcher(
  db: PrismaClient,
  options: DispatcherOptions,
): { stop(timeoutMs: number): Promise<void> } {
  const config = resolve(options);
  const running = new Set<Promise<void>>();
  let stopping = false;
  let databaseDown = false;
  let wake = () => {};

  // Until the poll interval passes, a handler finishes or stop() is called.
  const idle = () =>
    new Promise<void>((done) => {
      const timer = setTimeout(done, config.pollIntervalMs);
      wake = () => {
        clearTimeout(timer);
        done();
      };
    });

  async function poll(): Promise<void> {
    while (!stopping) {
      const free = config.concurrency - running.size;
      let started = 0;
      try {
        started = await fill(db, config, running, () => wake());
        if (databaseDown) config.logger.info("[outbox] polling again");
        databaseDown = false;
      } catch (error) {
        // Once per outage, not once per poll.
        if (!databaseDown) {
          config.logger.error(
            `[outbox] could not poll for events: ${describeError(error)}`,
          );
        }
        databaseDown = true;
      }
      // Every slot is taken, or nothing more is due.
      if (free === 0 || started < free) await idle();
    }
  }

  const polling = poll();

  return {
    async stop(timeoutMs) {
      stopping = true;
      wake();
      await polling;
      const deadline = new AbortController();
      const finished = await Promise.race([
        Promise.allSettled([...running]).then(() => true),
        sleep(timeoutMs, false, { signal: deadline.signal }).catch(() => false),
      ]);
      deadline.abort();
      if (!finished) {
        config.logger.warn(
          `[outbox] ${running.size} event(s) still running at shutdown: ` +
            "they will be retried when their claim expires",
        );
      }
    },
  };
}

/**
 * Runs every event that is due, and their retries as they come due, until
 * none is left; returns the number of attempts made. For tests and one-off
 * scripts: the worker polls with startOutboxDispatcher().
 */
export async function drainOutbox(
  db: PrismaClient,
  options: DispatcherOptions,
): Promise<number> {
  const config = resolve(options);
  const running = new Set<Promise<void>>();
  let attempts = 0;
  for (;;) {
    attempts += await fill(db, config, running);
    if (running.size === 0) return attempts;
    await Promise.race(running);
  }
}

/** Claims events for the free slots and starts their handlers. */
async function fill(
  db: PrismaClient,
  config: Config,
  running: Set<Promise<void>>,
  onSettled?: () => void,
): Promise<number> {
  const free = config.concurrency - running.size;
  if (free <= 0) return 0;

  const events = await claim(
    db,
    free,
    config.handlerTimeoutMs + LEASE_MARGIN_MS,
  );
  for (const event of events) {
    const run = runEvent(db, event, config).finally(() => {
      running.delete(run);
      onSettled?.();
    });
    running.add(run);
  }
  return events.length;
}

/**
 * Takes up to `limit` due events for `leaseMs`: counts the attempt and moves
 * availableAt forward, so no other dispatcher sees them until the lease runs
 * out. SKIP LOCKED: two dispatchers claiming at once take different rows
 * instead of waiting for each other.
 *
 * Time is the database's (now()), as in the column's default: the clocks of
 * the app, the worker and the database may differ. now() is cut to the
 * column's milliseconds, or an event written in this very millisecond could
 * look like it is still in the future.
 */
function claim(
  db: PrismaClient,
  limit: number,
  leaseMs: number,
): Promise<ClaimedEvent[]> {
  return db.$queryRaw<ClaimedEvent[]>`
    WITH due AS MATERIALIZED (
      SELECT "id" FROM "Outbox"
      WHERE "status" = 'PENDING' AND "availableAt" <= now()::timestamptz(3)
      ORDER BY "availableAt", "id"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "Outbox" AS o
    SET "attempts" = o."attempts" + 1,
        "availableAt" = now() + ${leaseMs}::int * interval '1 millisecond',
        "updatedAt" = now()
    FROM due
    WHERE o."id" = due."id"
    RETURNING o."id", o."type", o."payload", o."attempts"`;
}

/** Runs one claimed event and records the outcome; never rejects. */
async function runEvent(
  db: PrismaClient,
  event: ClaimedEvent,
  config: Config,
): Promise<void> {
  const { logger, maxAttempts } = config;
  const label = `[outbox] ${event.type} ${event.id}`;

  try {
    let failure: string | undefined;
    if (event.attempts > maxAttempts) {
      // The last attempt was claimed and never settled: don't let an event
      // that kills its worker run forever.
      failure = "the last attempt never finished (worker stopped or timed out)";
    } else {
      try {
        await runHandler(event, config);
      } catch (error) {
        failure = describeError(error);
      }
    }

    // `attempts` guards every outcome: if the lease ran out and the event was
    // claimed again, that attempt owns the row now.
    let saved: number;
    if (failure === undefined) {
      saved = await db.$executeRaw`
        UPDATE "Outbox"
        SET "status" = 'PROCESSED', "processedAt" = now(), "updatedAt" = now()
        WHERE "id" = ${event.id} AND "status" = 'PENDING'
          AND "attempts" = ${event.attempts}`;
      if (saved) logger.info(`${label}: done (attempt ${event.attempts})`);
    } else if (event.attempts >= maxAttempts) {
      saved = await db.$executeRaw`
        UPDATE "Outbox"
        SET "status" = 'FAILED', "lastError" = ${failure}, "updatedAt" = now()
        WHERE "id" = ${event.id} AND "status" = 'PENDING'
          AND "attempts" = ${event.attempts}`;
      if (saved) {
        logger.error(
          `${label}: FAILED after ${event.attempts} attempts: ${failure}`,
        );
      }
    } else {
      const delayMs = Math.round(config.retryDelayMs(event.attempts));
      saved = await db.$executeRaw`
        UPDATE "Outbox"
        SET "availableAt" = now() + ${delayMs}::int * interval '1 millisecond',
            "lastError" = ${failure}, "updatedAt" = now()
        WHERE "id" = ${event.id} AND "status" = 'PENDING'
          AND "attempts" = ${event.attempts}`;
      if (saved) {
        logger.warn(
          `${label}: attempt ${event.attempts} of ${maxAttempts} failed, ` +
            `next in ${Math.round(delayMs / 1000)} s: ${failure}`,
        );
      }
    }
    if (!saved) {
      logger.warn(
        `${label}: attempt ${event.attempts} lost its claim before it ` +
          "finished; a later attempt decides the outcome",
      );
    }
  } catch (error) {
    logger.error(
      `${label}: could not save the outcome of attempt ${event.attempts} ` +
        `(${describeError(error)}); it will run again when its claim expires`,
    );
  }
}

async function runHandler(event: ClaimedEvent, config: Config): Promise<void> {
  // Object.hasOwn: the type is a string from the database, and "toString"
  // is not an event.
  if (!Object.hasOwn(outboxEvents, event.type)) {
    // A worker one deploy behind the app: retried until it catches up.
    throw new Error(`unknown outbox event type "${event.type}"`);
  }
  const type = event.type as OutboxEventType;
  const payload = outboxEvents[type].parse(event.payload);
  const handler = config.handlers[type] as OutboxHandler<OutboxEventType>;

  const timeout = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(
        `timed out after ${config.handlerTimeoutMs / 1000} s`,
      );
      timeout.abort(error);
      reject(error);
    }, config.handlerTimeoutMs);
  });

  try {
    await Promise.race([
      handler(payload, {
        eventId: event.id,
        attempt: event.attempts,
        signal: timeout.signal,
      }),
      timedOut,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
