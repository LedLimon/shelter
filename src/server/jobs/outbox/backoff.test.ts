import { describe, expect, it } from "vitest";
import { retryDelayMs } from "./backoff";

const MINUTE = 60_000;

describe("retryDelayMs", () => {
  it.each([
    [1, 1],
    [2, 2],
    [3, 4],
    [4, 8],
    [8, 128],
    [9, 240],
    [10, 240],
    [50, 240],
  ])("after attempt %i waits %i min", (attempt, minutes) => {
    expect(retryDelayMs(attempt)).toBe(minutes * MINUTE);
  });

  it("keeps a failing event for about 8 hours with the default 10 attempts", () => {
    // The delays between attempts 1…10.
    const total = Array.from({ length: 9 }, (_, i) =>
      retryDelayMs(i + 1),
    ).reduce((sum, delay) => sum + delay, 0);

    expect(total / (60 * MINUTE)).toBeCloseTo(8.25);
  });
});
