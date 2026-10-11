import { describe, expect, it } from "vitest";
import { normalizeBackupCode } from "./backup-code";

describe("normalizeBackupCode", () => {
  it.each([
    ["k7m2p-xq9ra", "k7m2p-xq9ra"],
    ["K7M2P-XQ9RA", "k7m2p-xq9ra"],
    [" k7m2pxq9ra ", "k7m2p-xq9ra"],
    ["k7m2p xq9ra", "k7m2p-xq9ra"],
    ["short", "short"],
  ])("%j → %j", (input, expected) => {
    expect(normalizeBackupCode(input)).toBe(expected);
  });
});
