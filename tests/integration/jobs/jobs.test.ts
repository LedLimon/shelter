// eslint-disable-next-line no-restricted-imports -- TestClock moves pg-boss's time by hand
import { TestClock } from "pg-boss";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { getDb } from "@/server/db";
import { enqueueJob } from "@/server/jobs";
import {
  createBoss,
  jobIdOf,
  registerJobs,
  sendJob,
  type BossOptions,
  type JobContext,
  type PgBoss,
  type RegisterOptions,
} from "@/server/jobs/boss";
import { outboxHandlers } from "@/server/jobs/handlers";
import { drainOutbox } from "@/server/jobs/outbox/dispatcher";
import {
  clearOutbox,
  deferred,
  logged,
  outboxRow,
  skipBackoff,
  testLogger,
  type TestLogger,
} from "./helpers";

type Handler = (payload: never, context: JobContext) => Promise<void>;

let logger: TestLogger;
const started: PgBoss[] = [];

/** A started pg-boss instance, stopped after the test. */
async function startBoss(options: BossOptions = {}): Promise<PgBoss> {
  const boss = createBoss(getEnv().DATABASE_URL, logger, {
    __test__enableSpies: true,
    ...options,
  });
  await boss.start();
  started.push(boss);
  return boss;
}

function register(
  boss: PgBoss,
  options: Pick<RegisterOptions, "handlers"> & Partial<RegisterOptions>,
): Promise<void> {
  return registerJobs(boss, {
    timeZone: "Europe/Moscow",
    logger,
    pollingIntervalSeconds: 0.5,
    ...options,
  });
}

/** Runs the outbox as the worker does, with "job.run" wired to `boss`. */
function relayOutbox(boss: PgBoss): Promise<number> {
  return drainOutbox(getDb(), {
    handlers: outboxHandlers({
      sendJob: (name, payload, options) =>
        sendJob(boss, name, payload, options),
    }),
    logger,
  });
}

beforeEach(async () => {
  logger = testLogger();
  await clearOutbox();
});

afterEach(async () => {
  await Promise.all(
    started.splice(0).map((boss) => boss.stop({ timeout: 5_000 })),
  );
});

describe("enqueueJob", () => {
  it("starts the job once the transaction commits, exactly once", async () => {
    const handler = vi.fn<Handler>(() => Promise.resolve());
    const boss = await startBoss();
    await register(boss, { handlers: { noop: handler } });
    // A spy records nothing from before it was asked for.
    const spy = boss.getSpy("noop");

    const eventId = (await getDb().$transaction((tx) =>
      enqueueJob(tx, "noop", { note: "run me" }),
    ))!;
    expect(await outboxRow(eventId)).toMatchObject({
      type: "job.run",
      payload: { name: "noop", payload: { note: "run me" } },
    });
    await relayOutbox(boss);
    const jobId = jobIdOf(eventId);
    await spy.waitForJobWithId(jobId, "completed");

    // The event is delivered again, as after a worker that died before
    // recording the outcome: it must not start a second job.
    await getDb().outbox.update({
      where: { id: eventId },
      data: { status: "PENDING" },
    });
    await skipBackoff();
    await relayOutbox(boss);

    expect(await outboxRow(eventId)).toMatchObject({ status: "PROCESSED" });
    expect(
      await boss.findJobs("noop", { data: { note: "run me" } }),
    ).toHaveLength(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      { note: "run me" },
      { jobId, attempt: 1, signal: expect.any(AbortSignal) as AbortSignal },
    );
    expect(logged(logger, "info")).toContain(
      `[jobs] noop ${jobId}: done (attempt 1)`,
    );
  });

  it("starts nothing when the transaction rolls back", async () => {
    const boss = await startBoss();
    await register(boss, { handlers: { noop: () => Promise.resolve() } });

    await expect(
      getDb().$transaction(async (tx) => {
        await enqueueJob(tx, "noop", { note: "rolled back" });
        throw new Error("the business change failed");
      }),
    ).rejects.toThrow("the business change failed");

    expect(await relayOutbox(boss)).toBe(0);
    expect(
      await boss.findJobs("noop", { data: { note: "rolled back" } }),
    ).toHaveLength(0);
  });

  it("rejects a payload the job wouldn't accept", async () => {
    await expect(
      enqueueJob(getDb(), "noop", { note: 42 as unknown as string }),
    ).rejects.toThrow();

    expect(await getDb().outbox.count()).toBe(0);
  });

  it("keeps retrying a job this worker doesn't know yet", async () => {
    const boss = await startBoss();
    // Written by a newer version of the app, mid-deploy.
    const { id } = await getDb().outbox.create({
      data: {
        type: "job.run",
        payload: { name: "from.the.future", payload: {} },
      },
    });

    await relayOutbox(boss);

    expect(await outboxRow(id)).toMatchObject({
      status: "PENDING",
      attempts: 1,
      lastError: 'Error: unknown job "from.the.future"',
    });
  });
});

describe("registerJobs", () => {
  it("retries a failing job, then leaves it failed", async () => {
    const handler = vi.fn<Handler>(() =>
      Promise.reject(new Error("mail to anna@example.ru bounced")),
    );
    const boss = await startBoss();
    await register(boss, {
      definitions: {
        "test.failing": {
          payload: z.object({ donationId: z.string() }),
          queue: { retryLimit: 2, retryDelay: 0, retryBackoff: false },
        },
      },
      handlers: { "test.failing": handler },
    });
    const spy = boss.getSpy("test.failing");

    const id = (await boss.send("test.failing", { donationId: "d1" }))!;
    await spy.waitForJobWithId(id, "failed");

    expect(handler.mock.calls.map(([, context]) => context.attempt)).toEqual([
      1, 2, 3,
    ]);
    expect(logged(logger, "warn")).toEqual([
      `[jobs] test.failing ${id}: attempt 1 of 3 failed, will be retried: Error: mail to [email] bounced`,
      `[jobs] test.failing ${id}: attempt 2 of 3 failed, will be retried: Error: mail to [email] bounced`,
    ]);
    expect(logged(logger, "error")).toEqual([
      `[jobs] test.failing ${id}: FAILED after 3 attempts: Error: mail to [email] bounced`,
    ]);
    const [job] = await boss.findJobs("test.failing", { id });
    expect(job).toMatchObject({ state: "failed", retryCount: 2 });
    // pg-boss stores the error it was given: the described one.
    expect(JSON.stringify(job!.output)).toContain("mail to [email] bounced");
    expect(JSON.stringify(job!.output)).not.toContain("anna@");
  });

  it("logs a run that outlived its time as failed, not as done", async () => {
    const finished = deferred();
    // Ignores the signal, like a long database query would.
    const handler = vi.fn<Handler>(async () => {
      await new Promise((done) => setTimeout(done, 1_500));
      finished.resolve();
    });
    const boss = await startBoss();
    await register(boss, {
      definitions: {
        "test.slow": {
          payload: z.object({}),
          queue: { retryLimit: 0, expireInSeconds: 1 },
        },
      },
      handlers: { "test.slow": handler },
    });
    const spy = boss.getSpy("test.slow");

    const id = (await boss.send("test.slow", {}))!;
    await spy.waitForJobWithId(id, "failed");
    await finished.promise;

    expect(logged(logger, "error")).toEqual([
      `[jobs] test.slow ${id}: FAILED after 1 attempts: cut off while running: it ran over 1 s, or the worker is stopping`,
    ]);
    // The handler returned in the end, but the attempt was no longer its.
    expect(logged(logger, "info")).toEqual([]);
  });

  it("fails a job whose data doesn't fit its schema, without running it", async () => {
    const handler = vi.fn<Handler>(() => Promise.resolve());
    const boss = await startBoss();
    await register(boss, {
      definitions: {
        "test.strict": {
          payload: z.object({ donationId: z.string() }),
          queue: { retryLimit: 0 },
        },
      },
      handlers: { "test.strict": handler },
    });
    const spy = boss.getSpy("test.strict");

    const id = (await boss.send("test.strict", { donationId: 42 }))!;
    await spy.waitForJobWithId(id, "failed");

    expect(handler).not.toHaveBeenCalled();
    expect(logged(logger, "error")).toEqual([
      `[jobs] test.strict ${id}: FAILED after 1 attempts: ZodError: donationId: invalid_type`,
    ]);
  });

  it("creates the queue with the job's settings and updates them later", async () => {
    const payload = z.object({});
    const handlers = { "test.settings": () => Promise.resolve() };
    const boss = await startBoss();

    await register(boss, {
      definitions: { "test.settings": { payload } },
      handlers,
    });
    expect(await boss.getQueue("test.settings")).toMatchObject({
      policy: "standard",
      retryLimit: 3,
      retryDelay: 60,
      retryBackoff: true,
      retryDelayMax: 3600,
      expireInSeconds: 900,
    });

    // The next deploy changes the job's settings.
    const next = await startBoss();
    await register(next, {
      definitions: {
        "test.settings": {
          payload,
          queue: { retryLimit: 1, expireInSeconds: 60, heartbeatSeconds: 30 },
        },
      },
      handlers,
    });
    expect(await next.getQueue("test.settings")).toMatchObject({
      retryLimit: 1,
      retryDelay: 60,
      expireInSeconds: 60,
      heartbeatSeconds: 30,
    });
    expect(logged(logger, "warn")).toEqual([]);
  });

  it("warns when the code asks for another policy than the queue has", async () => {
    const payload = z.object({});
    const handlers = { "test.policy": () => Promise.resolve() };
    const boss = await startBoss();
    await register(boss, {
      definitions: { "test.policy": { payload } },
      handlers,
    });

    const next = await startBoss();
    await register(next, {
      definitions: {
        "test.policy": { payload, queue: { policy: "singleton" } },
      },
      handlers,
    });

    expect(await next.getQueue("test.policy")).toMatchObject({
      policy: "standard",
    });
    expect(logged(logger, "warn")).toEqual([
      '[jobs] test.policy: the queue keeps its policy "standard", the code asks for "singleton". pg-boss can\'t change it: delete the queue or rename the job',
    ]);
  });

  it("refuses to start a job that has no handler", async () => {
    const boss = await startBoss();

    await expect(
      register(boss, {
        definitions: { "test.orphan": { payload: z.object({}) } },
        handlers: {},
      }),
    ).rejects.toThrow('job "test.orphan" has no handler');
  });
});

describe("schedules", () => {
  const payload = z.object({ source: z.string().default("manual") });
  const handlers = { "test.nightly": () => Promise.resolve() };

  it("stores a job's schedule in the shelter's time zone and removes it with the job's", async () => {
    const boss = await startBoss();

    await register(boss, {
      definitions: {
        "test.nightly": {
          payload,
          schedule: { cron: "0 4 * * *", payload: { source: "cron" } },
        },
      },
      handlers,
      timeZone: "Asia/Yekaterinburg",
    });
    expect(await boss.getSchedules()).toEqual([
      expect.objectContaining({
        name: "test.nightly",
        cron: "0 4 * * *",
        timezone: "Asia/Yekaterinburg",
        data: { source: "cron" },
        options: expect.objectContaining({ missed: "once" }) as unknown,
      }),
    ]);

    // The next deploy drops the schedule; the job stays.
    const next = await startBoss();
    await register(next, {
      definitions: { "test.nightly": { payload } },
      handlers,
    });
    expect(await next.getSchedules()).toEqual([]);
  });

  it("refuses to start with a scheduled payload the job would reject", async () => {
    const boss = await startBoss();

    await expect(
      register(boss, {
        definitions: {
          "test.nightly": {
            payload: z.object({ date: z.string() }),
            // No payload: a scheduled run would get {}.
            schedule: { cron: "0 4 * * *" },
          },
        },
        handlers,
      }),
    ).rejects.toThrow();
    expect(await boss.getSchedules()).toEqual([]);
  });

  it("runs a scheduled job when its time comes in the shelter's zone", async () => {
    const handler = vi.fn<Handler>(() => Promise.resolve());
    // Half a minute before 04:00 in Moscow.
    const clock = new TestClock("2026-10-12T00:59:30Z");
    const boss = await startBoss({ clock });
    await register(boss, {
      definitions: {
        "test.nightly": {
          payload,
          schedule: { cron: "0 4 * * *", payload: { source: "cron" } },
        },
      },
      handlers: { "test.nightly": handler },
    });
    const spy = boss.getSpy<{ source: string }>("test.nightly");

    await clock.tick(25_000);
    expect(handler).not.toHaveBeenCalled();

    // Past 04:00: the schedule sends the job, the worker picks it up.
    await clock.tick(95_000);
    await spy.waitForJob((data) => data.source === "cron", "completed");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      { source: "cron" },
      expect.objectContaining({ attempt: 1 }),
    );
  });
});
