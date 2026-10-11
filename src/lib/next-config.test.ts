import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("next.config.ts", () => {
  // Nothing fails loudly if this goes: after a restart, pages expired by a
  // cache tag (a newly published offer) would be served from disk as fresh,
  // because Next keeps tag expiry in memory only.
  it("keeps the ISR cache off the disk, so tag expiry survives a restart", () => {
    expect(nextConfig.experimental?.isrFlushToDisk).toBe(false);
  });
});
