import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { getDb } from "@/server/db";
import { enqueueJob, outbox } from "@/server/jobs";
import { jobIdOf } from "@/server/jobs/boss";
import { jobs } from "@/server/jobs/definitions";
import { jobHandlers } from "@/server/jobs/handlers";
import { startWorker } from "@/server/jobs/worker";
import { setSetting } from "@/server/settings";
import {
  clearOutbox,
  eventually,
  logged,
  outboxRow,
  testLogger,
} from "./helpers";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

type JobRow = { state: string };

/** The pg-boss jobs started by a "job.run" outbox event. */
function jobsOf(eventId: string): Promise<JobRow[]> {
  return getDb().$queryRaw<JobRow[]>`
    SELECT "state"::text AS "state" FROM pgboss.job
    WHERE "id" = ${jobIdOf(eventId)}::uuid`;
}

beforeEach(clearOutbox);

describe("startWorker", () => {
  it("runs outbox events and jobs until it is stopped", async () => {
    const logger = testLogger();
    const worker = await startWorker({
      logger,
      outbox: { pollIntervalMs: 10 },
      jobs: { pollingIntervalSeconds: 0.5 },
    });
    try {
      const { eventId, jobEventId } = await getDb().$transaction(
        async (tx) => ({
          eventId: (await outbox.enqueue(tx, "noop", { note: "event" }))!,
          jobEventId: (await enqueueJob(tx, "noop", { note: "job" }))!,
        }),
      );

      await eventually(async () => {
        expect(await outboxRow(eventId)).toMatchObject({ status: "PROCESSED" });
        expect(await jobsOf(jobEventId)).toEqual([{ state: "completed" }]);
      });
      expect(logged(logger, "info")).toEqual(
        expect.arrayContaining([
          "[worker] started: outbox, jobs: noop",
          `[outbox] noop ${eventId}: done (attempt 1)`,
          `[outbox] job.run ${jobEventId}: done (attempt 1)`,
          `[jobs] noop ${jobIdOf(jobEventId)}: done (attempt 1)`,
        ]),
      );
    } finally {
      await worker.stop(5_000);
    }

    expect(logged(logger, "info").at(-1)).toBe("[worker] stopped");
    expect(logged(logger, "error")).toEqual([]);
    // Nothing is picked up after stop().
    const late = (await outbox.enqueue(getDb(), "noop", {}))!;
    await new Promise((done) => setTimeout(done, 100));
    expect(await outboxRow(late)).toMatchObject({ status: "PENDING" });
  });
});

describe("startWorker schedules", () => {
  it("reads cron in the time zone of the shelter.timezone setting", async () => {
    await setSetting(getDb(), "shelter.timezone", "Asia/Novosibirsk");

    const worker = await startWorker({
      logger: testLogger(),
      jobs: {
        definitions: {
          ...jobs,
          "test.nightly": {
            payload: z.object({}),
            schedule: { cron: "0 4 * * *" },
          },
        },
        handlers: { ...jobHandlers, "test.nightly": () => Promise.resolve() },
      },
    });
    await worker.stop(5_000);

    expect(
      await getDb().$queryRaw`
        SELECT "name", "cron", "timezone" FROM pgboss.schedule`,
    ).toEqual([
      { name: "test.nightly", cron: "0 4 * * *", timezone: "Asia/Novosibirsk" },
    ]);
  });
});

describe("pnpm worker", () => {
  // The real entry point in a process of its own, as in production: tsx, the
  // worker's tsconfig with the `server-only` stub, signals.
  it("starts, does the work and exits cleanly on SIGTERM", async () => {
    const require = createRequire(import.meta.url);
    const child = spawn(
      process.execPath,
      [
        require.resolve("tsx/cli"),
        ...["--tsconfig", "tsconfig.worker.json"],
        "worker/index.ts",
      ],
      // The setup file has pointed DATABASE_URL at this file's database.
      { cwd: ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    const exited = once(child, "exit") as Promise<[number | null, string]>;

    try {
      await eventually(() => {
        expect(output).toContain("[worker] started");
      });
      const { eventId, jobEventId } = await getDb().$transaction(
        async (tx) => ({
          eventId: (await outbox.enqueue(tx, "noop", {}))!,
          jobEventId: (await enqueueJob(tx, "noop", { note: "process" }))!,
        }),
      );
      await eventually(async () => {
        expect(await outboxRow(eventId)).toMatchObject({ status: "PROCESSED" });
        expect(await jobsOf(jobEventId)).toEqual([{ state: "completed" }]);
      });

      child.kill("SIGTERM");
      const [code] = await exited;

      expect(output).toContain("[worker] SIGTERM: finishing running work");
      expect(output).toContain("[worker] stopped");
      expect(code, output).toBe(0);
    } finally {
      child.kill("SIGKILL");
    }
  });
});
