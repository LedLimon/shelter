import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/lib/env";
import { getDb } from "@/server/db";
import { createPrismaClient } from "@/server/db/client";
import { outbox } from "@/server/jobs";
import {
  drainOutbox,
  startOutboxDispatcher,
  type OutboxHandler,
} from "@/server/jobs/outbox/dispatcher";
import { getSetting, setSetting } from "@/server/settings";
import {
  clearOutbox,
  deferred,
  eventually,
  handlersWith,
  logged,
  outboxRow,
  secondsFromDbNow,
  skipBackoff,
  testLogger,
} from "./helpers";

type NoopHandler = OutboxHandler<"noop">;

const failing = (message = "provider is down") =>
  vi.fn<NoopHandler>(() => Promise.reject(new Error(message)));
const succeeding = () => vi.fn<NoopHandler>(() => Promise.resolve());

beforeEach(clearOutbox);

describe("outbox.enqueue", () => {
  it("writes the event with the caller's transaction", async () => {
    const id = await getDb().$transaction(async (tx) => {
      await setSetting(tx, "shelter.timezone", "Asia/Omsk");
      return outbox.enqueue(tx, "noop", { note: "committed" });
    });

    expect(await getSetting(getDb(), "shelter.timezone")).toBe("Asia/Omsk");
    expect(await outboxRow(id!)).toMatchObject({
      type: "noop",
      payload: { note: "committed" },
      status: "PENDING",
      attempts: 0,
      dedupeKey: null,
      lastError: null,
      processedAt: null,
    });
  });

  it("leaves nothing to run when the transaction rolls back", async () => {
    const handler = succeeding();

    await expect(
      getDb().$transaction(async (tx) => {
        await setSetting(tx, "shelter.timezone", "Asia/Tomsk");
        await outbox.enqueue(tx, "noop", { note: "rolled back" });
        throw new Error("the business change failed");
      }),
    ).rejects.toThrow("the business change failed");

    expect(await getDb().outbox.count()).toBe(0);
    const attempts = await drainOutbox(getDb(), {
      handlers: handlersWith({ noop: handler }),
      logger: testLogger(),
    });
    expect(attempts).toBe(0);
    expect(handler).not.toHaveBeenCalled();
    expect(await getSetting(getDb(), "shelter.timezone")).not.toBe(
      "Asia/Tomsk",
    );
  });

  it("writes one event per dedupeKey and doesn't break the transaction", async () => {
    const key = "noop:donation-1";
    const first = await outbox.enqueue(getDb(), "noop", {}, { dedupeKey: key });

    const second = await getDb().$transaction(async (tx) => {
      const id = await outbox.enqueue(tx, "noop", {}, { dedupeKey: key });
      // A caught unique violation would have aborted the transaction (25P02).
      await setSetting(tx, "shelter.timezone", "Asia/Chita");
      return id;
    });

    expect(first).toEqual(expect.any(String));
    expect(second).toBeNull();
    expect(await getDb().outbox.count({ where: { dedupeKey: key } })).toBe(1);
    expect(await getSetting(getDb(), "shelter.timezone")).toBe("Asia/Chita");
  });

  it("keeps the dedupeKey taken after the event was processed", async () => {
    const key = "noop:donation-2";
    await outbox.enqueue(getDb(), "noop", {}, { dedupeKey: key });
    await drainOutbox(getDb(), {
      handlers: handlersWith(),
      logger: testLogger(),
    });

    expect(
      await outbox.enqueue(getDb(), "noop", {}, { dedupeKey: key }),
    ).toBeNull();
  });

  it("rejects a payload of the wrong shape and writes nothing", async () => {
    await expect(
      outbox.enqueue(getDb(), "noop", { note: 42 as unknown as string }),
    ).rejects.toThrow();

    expect(await getDb().outbox.count()).toBe(0);
  });
});

describe("outbox dispatcher", () => {
  it("runs a committed event exactly once", async () => {
    const handler = succeeding();
    const logger = testLogger();
    const options = { handlers: handlersWith({ noop: handler }), logger };
    const id = await getDb().$transaction((tx) =>
      outbox.enqueue(tx, "noop", { note: "once" }),
    );

    expect(await drainOutbox(getDb(), options)).toBe(1);
    expect(await drainOutbox(getDb(), options)).toBe(0);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      { note: "once" },
      {
        eventId: id,
        attempt: 1,
        signal: expect.any(AbortSignal) as AbortSignal,
      },
    );
    const row = await outboxRow(id!);
    expect(row).toMatchObject({
      status: "PROCESSED",
      attempts: 1,
      lastError: null,
    });
    expect(Math.abs(await secondsFromDbNow(row.processedAt!))).toBeLessThan(5);
    expect(logged(logger, "info")).toEqual([
      `[outbox] noop ${id}: done (attempt 1)`,
    ]);
  });

  it("runs each event exactly once when two workers poll at the same time", async () => {
    const EVENTS = 200;
    const runs = new Map<string, number>();
    const handler: NoopHandler = async (_payload, { eventId }) => {
      runs.set(eventId, (runs.get(eventId) ?? 0) + 1);
      // Give the other worker time to try for the same rows.
      await new Promise((done) => setTimeout(done, Math.random() * 5));
    };
    const ids = await getDb().$transaction(async (tx) => {
      const created: string[] = [];
      for (let i = 0; i < EVENTS; i += 1) {
        created.push((await outbox.enqueue(tx, "noop", { note: `#${i}` }))!);
      }
      return created;
    });

    // Two worker processes: each has its own connection pool.
    const clients = [
      createPrismaClient(getEnv().DATABASE_URL),
      createPrismaClient(getEnv().DATABASE_URL),
    ];
    const options = {
      handlers: handlersWith({ noop: handler }),
      logger: testLogger(),
      pollIntervalMs: 5,
      concurrency: 4,
    };
    const dispatchers = clients.map((db) => startOutboxDispatcher(db, options));
    try {
      await eventually(async () => {
        expect(
          await getDb().outbox.count({ where: { status: "PROCESSED" } }),
        ).toBe(EVENTS);
      });
    } finally {
      await Promise.all(
        dispatchers.map((dispatcher) => dispatcher.stop(5_000)),
      );
      await Promise.all(clients.map((db) => db.$disconnect()));
    }

    expect([...runs.keys()].sort()).toEqual([...ids].sort());
    expect([...runs.values()].every((count) => count === 1)).toBe(true);
    expect(await getDb().outbox.count({ where: { attempts: 1 } })).toBe(EVENTS);
  });

  it("retries a failing handler with a growing delay, then marks the event FAILED", async () => {
    const handler = failing();
    const logger = testLogger();
    const options = {
      handlers: handlersWith({ noop: handler }),
      logger,
      maxAttempts: 3,
    };
    const id = (await outbox.enqueue(getDb(), "noop", {}))!;

    // Attempt 1 fails: the event waits a minute.
    expect(await drainOutbox(getDb(), options)).toBe(1);
    let row = await outboxRow(id);
    expect(row).toMatchObject({
      status: "PENDING",
      attempts: 1,
      lastError: "Error: provider is down",
    });
    expect(await secondsFromDbNow(row.availableAt)).toBeGreaterThan(55);
    expect(await secondsFromDbNow(row.availableAt)).toBeLessThanOrEqual(60);
    // Not before its time.
    expect(await drainOutbox(getDb(), options)).toBe(0);

    // Attempt 2 fails: two minutes.
    await skipBackoff();
    expect(await drainOutbox(getDb(), options)).toBe(1);
    row = await outboxRow(id);
    expect(row).toMatchObject({ status: "PENDING", attempts: 2 });
    expect(await secondsFromDbNow(row.availableAt)).toBeGreaterThan(115);
    expect(await secondsFromDbNow(row.availableAt)).toBeLessThanOrEqual(120);

    // Attempt 3 is the last.
    await skipBackoff();
    expect(await drainOutbox(getDb(), options)).toBe(1);
    expect(await outboxRow(id)).toMatchObject({
      status: "FAILED",
      attempts: 3,
      lastError: "Error: provider is down",
      processedAt: null,
    });

    // A FAILED event is never picked up again.
    await getDb().$executeRaw`UPDATE "Outbox" SET "availableAt" = now()`;
    expect(await drainOutbox(getDb(), options)).toBe(0);
    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler.mock.calls.map(([, context]) => context.attempt)).toEqual([
      1, 2, 3,
    ]);

    expect(logged(logger, "warn")).toEqual([
      `[outbox] noop ${id}: attempt 1 of 3 failed, next in 60 s: Error: provider is down`,
      `[outbox] noop ${id}: attempt 2 of 3 failed, next in 120 s: Error: provider is down`,
    ]);
    expect(logged(logger, "error")).toEqual([
      `[outbox] noop ${id}: FAILED after 3 attempts: Error: provider is down`,
    ]);
  });

  it("processes the event once the handler recovers", async () => {
    const handler = vi
      .fn<NoopHandler>()
      .mockRejectedValueOnce(new Error("first failure"))
      .mockRejectedValueOnce(new Error("second failure"))
      .mockResolvedValue(undefined);
    const id = (await outbox.enqueue(getDb(), "noop", {}))!;

    const attempts = await drainOutbox(getDb(), {
      handlers: handlersWith({ noop: handler }),
      logger: testLogger(),
      retryDelayMs: () => 0,
    });

    expect(attempts).toBe(3);
    expect(await outboxRow(id)).toMatchObject({
      status: "PROCESSED",
      attempts: 3,
      // Why it took three attempts.
      lastError: "Error: second failure",
    });
  });

  it("fails an attempt that runs out of time and tells the handler to stop", async () => {
    let signal: AbortSignal | undefined;
    const handler = vi.fn<NoopHandler>((_payload, context) => {
      signal = context.signal;
      return new Promise(() => {});
    });
    const id = (await outbox.enqueue(getDb(), "noop", {}))!;

    await drainOutbox(getDb(), {
      handlers: handlersWith({ noop: handler }),
      logger: testLogger(),
      maxAttempts: 1,
      handlerTimeoutMs: 50,
    });

    expect(signal?.aborted).toBe(true);
    expect(await outboxRow(id)).toMatchObject({
      status: "FAILED",
      lastError: "Error: timed out after 0.05 s",
    });
  });

  it("runs an event again when its worker died with it", async () => {
    const handler = succeeding();
    // Claimed once, never settled, and the lease has run out.
    const { id } = await getDb().outbox.create({
      data: { type: "noop", payload: {}, attempts: 1 },
    });

    await drainOutbox(getDb(), {
      handlers: handlersWith({ noop: handler }),
      logger: testLogger(),
    });

    expect(handler).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ eventId: id, attempt: 2 }),
    );
    expect(await outboxRow(id)).toMatchObject({
      status: "PROCESSED",
      attempts: 2,
    });
  });

  it("holds a claimed event back until its lease runs out", async () => {
    const started = deferred();
    const finish = deferred();
    const first = vi.fn<NoopHandler>(() => {
      started.resolve();
      return finish.promise;
    });
    const second = succeeding();
    const id = (await outbox.enqueue(getDb(), "noop", {}))!;

    const draining = drainOutbox(getDb(), {
      handlers: handlersWith({ noop: first }),
      logger: testLogger(),
    });
    await started.promise;

    // Another worker, while the first one is still running the handler.
    expect(
      await drainOutbox(getDb(), {
        handlers: handlersWith({ noop: second }),
        logger: testLogger(),
      }),
    ).toBe(0);
    // Handler's time limit (2 min) plus a margin (1 min).
    const lease = await secondsFromDbNow((await outboxRow(id)).availableAt);
    expect(lease).toBeGreaterThan(170);
    expect(lease).toBeLessThanOrEqual(180);

    finish.resolve();
    await draining;
    expect(second).not.toHaveBeenCalled();
    expect(await outboxRow(id)).toMatchObject({ status: "PROCESSED" });
  });

  it("gives up on an event whose last attempt never finished", async () => {
    const handler = succeeding();
    const logger = testLogger();
    // An event that kills its worker every time: all attempts claimed.
    const { id } = await getDb().outbox.create({
      data: { type: "noop", payload: {}, attempts: 3 },
    });

    await drainOutbox(getDb(), {
      handlers: handlersWith({ noop: handler }),
      logger,
      maxAttempts: 3,
    });

    expect(handler).not.toHaveBeenCalled();
    expect(await outboxRow(id)).toMatchObject({
      status: "FAILED",
      lastError:
        "the last attempt never finished (worker stopped or timed out)",
    });
    expect(logged(logger, "error")).toHaveLength(1);
  });

  it.each([
    ["fails", () => Promise.reject(new Error("too late"))],
    ["succeeds", () => Promise.resolve()],
  ])(
    "leaves the event to its new owner when a worker that lost its claim %s",
    async (_outcome, finish) => {
      const logger = testLogger();
      const id = (await outbox.enqueue(getDb(), "noop", {}))!;
      // While this handler runs, its lease runs out and another worker
      // claims the event: attempt 2, still running, with a lease of its own.
      const handler = vi.fn<NoopHandler>(async () => {
        await getDb().$executeRaw`
          UPDATE "Outbox"
          SET "attempts" = 2, "availableAt" = now() + interval '10 minutes'
          WHERE "id" = ${id}`;
        await finish();
      });

      await drainOutbox(getDb(), {
        handlers: handlersWith({ noop: handler }),
        logger,
      });

      // Attempt 1 changed nothing: status, error and lease are attempt 2's.
      const row = await outboxRow(id);
      expect(row).toMatchObject({
        status: "PENDING",
        attempts: 2,
        lastError: null,
        processedAt: null,
      });
      expect(await secondsFromDbNow(row.availableAt)).toBeGreaterThan(590);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(logged(logger, "warn")).toEqual([
        `[outbox] noop ${id}: attempt 1 lost its claim before it finished; a later attempt decides the outcome`,
      ]);
      expect(logged(logger, "info")).toEqual([]);
    },
  );

  it("retries an event of a type this worker doesn't know", async () => {
    // Written by a newer version of the app, mid-deploy.
    const { id } = await getDb().outbox.create({
      data: { type: "from.the.future", payload: {} },
    });

    await drainOutbox(getDb(), {
      handlers: handlersWith(),
      logger: testLogger(),
    });

    expect(await outboxRow(id)).toMatchObject({
      status: "PENDING",
      attempts: 1,
      lastError: 'Error: unknown outbox event type "from.the.future"',
    });
  });

  it("retries an event whose stored payload no longer fits the schema", async () => {
    const handler = succeeding();
    const { id } = await getDb().outbox.create({
      data: { type: "noop", payload: { note: 42 } },
    });

    await drainOutbox(getDb(), {
      handlers: handlersWith({ noop: handler }),
      logger: testLogger(),
    });

    expect(handler).not.toHaveBeenCalled();
    expect(await outboxRow(id)).toMatchObject({
      status: "PENDING",
      lastError: "ZodError: note: invalid_type",
    });
  });

  it("keeps personal data out of lastError and the log", async () => {
    const logger = testLogger();
    const id = (await outbox.enqueue(getDb(), "noop", {}))!;

    await drainOutbox(getDb(), {
      handlers: handlersWith({
        noop: failing(
          "550 5.1.1 <anna.ivanova@example.ru>: mailbox of +7 900 123-45-67 is full",
        ),
      }),
      logger,
      maxAttempts: 1,
    });

    const { lastError } = await outboxRow(id);
    expect(lastError).toBe(
      "Error: 550 5.1.1 <[email]>: mailbox of [number] is full",
    );
    expect(logged(logger, "error").join("\n")).not.toMatch(/anna|900/);
  });

  it("saves the outcome of an error whose text Postgres can't store as it is", async () => {
    const id = (await outbox.enqueue(getDb(), "noop", {}))!;

    await drainOutbox(getDb(), {
      // A NUL byte: Postgres rejects it in a text value.
      handlers: handlersWith({
        noop: failing("bad \u0000 byte from provider"),
      }),
      logger: testLogger(),
    });

    expect(await outboxRow(id)).toMatchObject({
      status: "PENDING",
      attempts: 1,
      lastError: "Error: bad byte from provider",
    });
  });
});

describe("startOutboxDispatcher", () => {
  it("picks up events enqueued while it runs", async () => {
    const handler = succeeding();
    const dispatcher = startOutboxDispatcher(getDb(), {
      handlers: handlersWith({ noop: handler }),
      logger: testLogger(),
      pollIntervalMs: 10,
    });
    try {
      const id = (await outbox.enqueue(getDb(), "noop", { note: "later" }))!;

      await eventually(async () => {
        expect(await outboxRow(id)).toMatchObject({ status: "PROCESSED" });
      });
      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      await dispatcher.stop(5_000);
    }
  });

  it("retries on its own when the backoff passes", async () => {
    const logger = testLogger();
    const dispatcher = startOutboxDispatcher(getDb(), {
      handlers: handlersWith({ noop: failing() }),
      logger,
      pollIntervalMs: 10,
      maxAttempts: 3,
      retryDelayMs: (attempt) => attempt * 20,
    });
    try {
      const id = (await outbox.enqueue(getDb(), "noop", {}))!;

      await eventually(async () => {
        expect(await outboxRow(id)).toMatchObject({
          status: "FAILED",
          attempts: 3,
        });
      });
      expect(logged(logger, "warn")).toHaveLength(2);
      expect(logged(logger, "error")).toEqual([
        `[outbox] noop ${id}: FAILED after 3 attempts: Error: provider is down`,
      ]);
    } finally {
      await dispatcher.stop(5_000);
    }
  });

  it("stop() waits for the running handler and takes no new events", async () => {
    const started = deferred();
    const finish = deferred();
    const handler = vi.fn<NoopHandler>(() => {
      started.resolve();
      return finish.promise;
    });
    const dispatcher = startOutboxDispatcher(getDb(), {
      handlers: handlersWith({ noop: handler }),
      logger: testLogger(),
      pollIntervalMs: 10,
      concurrency: 1,
    });
    const running = (await outbox.enqueue(getDb(), "noop", {}))!;
    await started.promise;
    const waiting = (await outbox.enqueue(getDb(), "noop", {}))!;

    let stopped = false;
    const stopping = dispatcher.stop(5_000).then(() => {
      stopped = true;
    });
    await new Promise((done) => setTimeout(done, 100));
    expect(stopped).toBe(false);

    finish.resolve();
    await stopping;
    expect(await outboxRow(running)).toMatchObject({ status: "PROCESSED" });
    expect(await outboxRow(waiting)).toMatchObject({
      status: "PENDING",
      attempts: 0,
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("stop() doesn't wait for a database that stopped answering", async () => {
    const logger = testLogger();
    // The connection hangs: the claim query never returns.
    const hung = {
      $queryRaw: () => new Promise(() => {}),
    } as unknown as PrismaClient;
    const dispatcher = startOutboxDispatcher(hung, {
      handlers: handlersWith(),
      logger,
    });

    await dispatcher.stop(50);

    expect(logged(logger, "warn")).toEqual([
      "[outbox] the last poll got no answer from the database before shutdown",
    ]);
  });

  it("stop() gives up waiting after its timeout and leaves the event to its lease", async () => {
    const started = deferred();
    const logger = testLogger();
    const dispatcher = startOutboxDispatcher(getDb(), {
      handlers: handlersWith({
        noop: () => {
          started.resolve();
          return new Promise(() => {});
        },
      }),
      logger,
      pollIntervalMs: 10,
    });
    const id = (await outbox.enqueue(getDb(), "noop", {}))!;
    await started.promise;

    await dispatcher.stop(50);

    expect(await outboxRow(id)).toMatchObject({
      status: "PENDING",
      attempts: 1,
    });
    expect(logged(logger, "warn")).toEqual([
      "[outbox] 1 event(s) still running at shutdown: they will be retried when their claim expires",
    ]);
  });
});
