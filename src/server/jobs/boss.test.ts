import { describe, expect, it, vi } from "vitest";
import { createBoss, jobIdOf } from "./boss";

describe("createBoss", () => {
  const logger = () => ({
    info: vi.fn<(message: string) => void>(),
    warn: vi.fn<(message: string) => void>(),
    error: vi.fn<(message: string) => void>(),
  });
  // pg-boss emits a copy of the error, not an Error instance.
  const failure = (message: string, queue?: string) =>
    ({ message, stack: "…", queue }) as unknown as Error;

  it("logs pg-boss errors with their queue, without personal data", () => {
    const log = logger();
    // Not started: nothing connects.
    const boss = createBoss("postgresql://localhost/none", log);

    boss.emit("error", failure("no pg_hba entry for anna@example.ru", "noop"));
    boss.emit("error", failure("connect ECONNREFUSED 127.0.0.1:5432"));

    expect(log.error.mock.calls).toEqual([
      ["[jobs] pg-boss (noop): no pg_hba entry for [email]"],
      ["[jobs] pg-boss: connect ECONNREFUSED 127.0.0.1:5432"],
    ]);
  });

  it("logs a repeating error once a minute, not on every poll", () => {
    vi.useFakeTimers();
    try {
      const log = logger();
      const boss = createBoss("postgresql://localhost/none", log);
      const down = failure("connect ECONNREFUSED 127.0.0.1:5432", "noop");

      boss.emit("error", down);
      vi.advanceTimersByTime(2_000);
      boss.emit("error", down);
      expect(log.error).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(60_000);
      boss.emit("error", down);
      expect(log.error).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("jobIdOf", () => {
  it("derives a UUID from the outbox event's id", () => {
    expect(jobIdOf("cmgk3x9f20000abcdqwerty12")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("gives the same job id for the same event and another for another", () => {
    expect(jobIdOf("event-1")).toBe(jobIdOf("event-1"));
    expect(jobIdOf("event-1")).not.toBe(jobIdOf("event-2"));
  });
});
