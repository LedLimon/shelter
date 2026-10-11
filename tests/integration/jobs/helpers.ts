// Shared by the jobs and outbox tests. A file's tests share one database:
// each test starts from an empty Outbox (clearOutbox() in beforeEach).
import { vi, type Mock } from "vitest";
import { getDb } from "@/server/db";
import { outboxHandlers } from "@/server/jobs/handlers";
import type { Logger } from "@/server/jobs/log";
import type { OutboxHandlers } from "@/server/jobs/outbox/dispatcher";

type Log = (message: string) => void;
export type TestLogger = { [Level in keyof Logger]: Mock<Log> };

/** Collects what the worker would print. */
export function testLogger(): TestLogger {
  return { info: vi.fn<Log>(), warn: vi.fn<Log>(), error: vi.fn<Log>() };
}

/** Every line logged at `level`, as text. */
export function logged(logger: TestLogger, level: keyof Logger): string[] {
  return logger[level].mock.calls.map(([message]) => message);
}

/**
 * The real outbox handlers with some replaced. "job.run" fails unless a test
 * gives it a pg-boss instance: no outbox test should start a job by accident.
 */
export function handlersWith(
  overrides: Partial<OutboxHandlers> = {},
): OutboxHandlers {
  return {
    ...outboxHandlers({
      sendJob: () => Promise.reject(new Error("no pg-boss in this test")),
    }),
    ...overrides,
  };
}

export async function clearOutbox(): Promise<void> {
  await getDb().outbox.deleteMany();
}

export function outboxRow(id: string) {
  return getDb().outbox.findUniqueOrThrow({ where: { id } });
}

/** Makes every waiting event due now, as if its backoff had passed. */
export async function skipBackoff(): Promise<void> {
  await getDb().$executeRaw`
    UPDATE "Outbox" SET "availableAt" = now() WHERE "status" = 'PENDING'`;
}

/** Seconds from the database's now() to `date`: its clock may differ from ours. */
export async function secondsFromDbNow(date: Date): Promise<number> {
  const [row] = await getDb().$queryRaw<{ seconds: number }[]>`
    SELECT extract(epoch FROM ${date}::timestamptz - clock_timestamp())::float8
      AS seconds`;
  return row!.seconds;
}

/** Polls until `check` stops throwing; fails with its last error. */
export function eventually(
  check: () => Promise<void> | void,
  timeoutMs = 15_000,
): Promise<void> {
  return vi.waitFor(check, { timeout: timeoutMs, interval: 25 });
}

export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
