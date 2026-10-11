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
import { uniqueAddress, waitForInbox } from "../../helpers/mailpit";
import { plain } from "../../helpers/text";
import {
  clearOutbox,
  eventually,
  logged,
  outboxRow,
  testLogger,
} from "./helpers";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
// tsx compiles the worker and everything it imports before the first line
// runs: a couple of seconds here, tens of them on a busy CI runner.
const STARTUP_TIMEOUT_MS = 60_000;

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
          `[worker] started: outbox, jobs: ${Object.keys(jobs).join(", ")}`,
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

    // Next to the schedules of the real jobs, in the same zone.
    expect(
      await getDb().$queryRaw`
        SELECT "name", "cron", "timezone" FROM pgboss.schedule
        WHERE "name" = 'test.nightly'`,
    ).toEqual([
      { name: "test.nightly", cron: "0 4 * * *", timezone: "Asia/Novosibirsk" },
    ]);
    expect(
      await getDb().$queryRaw`
        SELECT DISTINCT "timezone" FROM pgboss.schedule`,
    ).toEqual([{ timezone: "Asia/Novosibirsk" }]);
  });
});

describe("pnpm worker", () => {
  // The real entry point in a process of its own, as in production: tsx, the
  // worker's tsconfig with the `server-only` stub, signals. The letter is
  // here because only this process compiles the templates' JSX the way the
  // worker does and makes its SMTP client from the environment. One process
  // for everything: tsx takes seconds to start on a CI runner.
  it("starts, does the work, sends a letter and exits cleanly on SIGTERM", async () => {
    const require = createRequire(import.meta.url);
    const child = spawn(
      process.execPath,
      [
        require.resolve("tsx/cli"),
        ...["--tsconfig", "tsconfig.worker.json"],
        "worker/index.ts",
      ],
      // The setup file has pointed DATABASE_URL at this file's database and
      // SMTP_* at the run's Mailpit.
      { cwd: ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    const exited = once(child, "exit") as Promise<[number | null, string]>;

    try {
      await eventually(() => {
        expect(output).toContain("[worker] started");
      }, STARTUP_TIMEOUT_MS);
      const address = uniqueAddress("owner");
      const owner = await getDb().user.create({
        data: { email: address, name: "Владелец", role: "OWNER" },
      });
      const { eventId, jobEventId, letterEventId } = await getDb().$transaction(
        async (tx) => ({
          eventId: (await outbox.enqueue(tx, "noop", {}))!,
          jobEventId: (await enqueueJob(tx, "noop", { note: "process" }))!,
          letterEventId: (await outbox.enqueue(tx, "email.test", {
            template: "donation.thanks",
            example: "need",
            userId: owner.id,
          }))!,
        }),
      );
      await eventually(async () => {
        expect(await outboxRow(eventId)).toMatchObject({ status: "PROCESSED" });
        expect(await jobsOf(jobEventId)).toEqual([{ state: "completed" }]);
        expect(await outboxRow(letterEventId)).toMatchObject({
          status: "PROCESSED",
        });
      });
      const [letter] = await waitForInbox(address);
      expect(plain(letter!.subject)).toBe(
        "Проверка: Спасибо! Мы получили ваше пожертвование — 1 500 ₽",
      );
      expect(letter!.html).toContain("Корм на октябрь");

      child.kill("SIGTERM");
      const [code] = await exited;

      expect(output).toContain("[worker] SIGTERM: finishing running work");
      expect(output).toContain("[worker] stopped");
      expect(output).toContain(
        `[outbox] email.test ${letterEventId}: done (attempt 1)`,
      );
      // The log names events, never readers.
      expect(output).not.toContain(address);
      expect(code, output).toBe(0);
    } finally {
      child.kill("SIGKILL");
    }
  }, 90_000);
});
