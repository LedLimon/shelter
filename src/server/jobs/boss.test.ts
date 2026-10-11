import { describe, expect, it } from "vitest";
import { jobIdOf } from "./boss";

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
