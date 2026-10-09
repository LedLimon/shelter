import { readFileSync } from "node:fs";
import { parseEnv as parseDotenv } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serverEnvSchema } from "./schema";

const example = parseDotenv(
  readFileSync(new URL("../../../.env.example", import.meta.url), "utf8"),
);

beforeEach(() => {
  vi.resetModules();
  // Empty counts as unset, so this hides whatever the shell has exported.
  for (const key of Object.keys(serverEnvSchema.shape)) vi.stubEnv(key, "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getEnv", () => {
  it("validates on first call, not on import, so next build needs no env", async () => {
    const { getEnv } = await import("./index");

    expect(() => getEnv()).toThrow("DATABASE_URL: is not set");
  });

  it("reads process.env once and caches the result", async () => {
    for (const [key, value] of Object.entries(example)) vi.stubEnv(key, value);
    const { getEnv } = await import("./index");

    const first = getEnv();
    vi.stubEnv("SMTP_PORT", "2525");

    expect(getEnv()).toBe(first);
    expect(first.SMTP_PORT).toBe(1025);
  });
});

describe("checkEnvOrExit", () => {
  it("prints the problems and exits with code 1", async () => {
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { checkEnvOrExit } = await import("./check");

    checkEnvOrExit();

    expect(exit).toHaveBeenCalledWith(1);
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toContain("  - S3_BUCKET: is not set");
  });

  it("passes silently when the environment is valid", async () => {
    for (const [key, value] of Object.entries(example)) vi.stubEnv(key, value);
    const exit = vi.spyOn(process, "exit");
    const { checkEnvOrExit } = await import("./check");

    checkEnvOrExit();

    expect(exit).not.toHaveBeenCalled();
  });
});
