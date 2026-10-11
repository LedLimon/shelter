import { readFileSync } from "node:fs";
import { parseEnv as parseDotenv } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serverEnvSchema } from "./schema";

// .env.example with its empty secrets filled in.
const example = {
  ...parseDotenv(
    readFileSync(new URL("../../../.env.example", import.meta.url), "utf8"),
  ),
  BETTER_AUTH_SECRET: "x".repeat(32),
};

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

  // The default provider is the payment emulator: a production server that
  // forgot the variable must stop, not start with it.
  it("demands a payment provider in a production build", async () => {
    for (const [key, value] of Object.entries(example)) vi.stubEnv(key, value);
    vi.stubEnv("NODE_ENV", "production");
    const { getEnv } = await import("./index");

    vi.stubEnv("PAYMENT_PROVIDER", "");

    expect(() => getEnv()).toThrow("  - PAYMENT_PROVIDER: is not set");

    vi.stubEnv("PAYMENT_PROVIDER", "fake");
    expect(getEnv().PAYMENT_PROVIDER).toBe("fake");
  });

  it("defaults to the emulator outside production", async () => {
    for (const [key, value] of Object.entries(example)) vi.stubEnv(key, value);
    vi.stubEnv("NODE_ENV", "development");
    const { getEnv } = await import("./index");

    expect(getEnv().PAYMENT_PROVIDER).toBe("fake");
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
