import { readFileSync } from "node:fs";
import { parseEnv as parseDotenv } from "node:util";
import { describe, expect, it } from "vitest";
import {
  EnvValidationError,
  parseEnv,
  publicEnvSchema,
  serverEnvSchema,
} from "./schema";

const example = parseDotenv(
  readFileSync(new URL("../../../.env.example", import.meta.url), "utf8"),
);

const parseServer = (overrides: Record<string, string | undefined> = {}) =>
  parseEnv(serverEnvSchema, { ...example, ...overrides }, "server");

function errorOf(fn: () => unknown): EnvValidationError {
  try {
    fn();
  } catch (error) {
    if (error instanceof EnvValidationError) return error;
    throw error;
  }
  throw new Error("expected EnvValidationError");
}

describe("server env", () => {
  it("accepts .env.example as is", () => {
    const env = parseServer();

    expect(env.DATABASE_URL).toBe(
      "postgresql://shelter:shelter@localhost:5432/shelter",
    );
    expect(env.SMTP_PORT).toBe(1025);
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
    expect(env.SMTP_SECURE).toBe(false);
    expect(env.SMTP_FROM).toBe("Приют <no-reply@shelter.localhost>");
  });

  it("reports a missing required variable by name", () => {
    const error = errorOf(() => parseServer({ DATABASE_URL: undefined }));

    expect(error.message).toContain("Invalid server environment variables:");
    expect(error.message).toContain("  - DATABASE_URL: is not set");
    expect(error.message).toContain("Copy .env.example to .env");
  });

  it("treats an empty value as unset", () => {
    const error = errorOf(() => parseServer({ S3_BUCKET: "" }));

    expect(error.message).toContain("  - S3_BUCKET: is not set");
  });

  it("lists every problem at once", () => {
    const error = errorOf(() =>
      parseServer({ APP_URL: undefined, SMTP_HOST: "", SMTP_PORT: undefined }),
    );

    expect(error.message).toContain("APP_URL: is not set");
    expect(error.message).toContain("SMTP_HOST: is not set");
    expect(error.message).toContain("SMTP_PORT: is not set");
  });

  it.each([
    ["APP_URL", "localhost:3000", "must be an http(s):// URL"],
    ["S3_ENDPOINT", "ftp://storage", "must be an http(s):// URL"],
    ["DATABASE_URL", "mysql://user@host/db", "must be a postgresql:// URL"],
    ["SHELTER_TIMEZONE", "Mars/Olympus", "must be an IANA time zone"],
    ["SMTP_PORT", "smtp", "must be a port number"],
    ["SMTP_PORT", "70000", "must be a port number"],
    ["SMTP_PORT", "25.5", "must be a port number"],
    ["S3_FORCE_PATH_STYLE", "maybe", "must be true or false"],
  ])("rejects %s=%s", (key, value, expected) => {
    const error = errorOf(() => parseServer({ [key]: value }));

    expect(error.message).toContain(`  - ${key}: `);
    expect(error.message).toContain(expected);
  });

  it("never prints variable values", () => {
    const error = errorOf(() =>
      parseServer({
        DATABASE_URL: "mysql://admin:hunter2@db/prod",
        SMTP_USER: "mailer",
        SMTP_PASSWORD: undefined,
      }),
    );

    expect(error.message).not.toContain("hunter2");
    expect(error.message).not.toContain("mailer");
  });

  it("requires SMTP_USER and SMTP_PASSWORD together", () => {
    expect(
      errorOf(() => parseServer({ SMTP_USER: "mailer" })).message,
    ).toContain("SMTP_PASSWORD: SMTP_USER and SMTP_PASSWORD must be set");
    expect(
      errorOf(() => parseServer({ SMTP_PASSWORD: "secret" })).message,
    ).toContain("SMTP_USER: SMTP_USER and SMTP_PASSWORD must be set");
    expect(
      parseServer({ SMTP_USER: "mailer", SMTP_PASSWORD: "secret" }).SMTP_USER,
    ).toBe("mailer");
  });

  it("applies defaults and normalizes values", () => {
    const env = parseServer({
      APP_URL: "https://priyut.example/",
      SHELTER_TIMEZONE: undefined,
      S3_FORCE_PATH_STYLE: undefined,
      SMTP_SECURE: "true",
      CLOUDPAYMENTS_PUBLIC_ID: "",
    });

    expect(env.APP_URL).toBe("https://priyut.example");
    expect(env.SHELTER_TIMEZONE).toBe("Europe/Moscow");
    expect(env.S3_FORCE_PATH_STYLE).toBe(false);
    expect(env.SMTP_SECURE).toBe(true);
    expect(env.CLOUDPAYMENTS_PUBLIC_ID).toBeUndefined();
  });

  it("returns only declared variables", () => {
    const env = parseServer({ PATH: "/usr/bin", NEXT_PUBLIC_FOO: "x" });

    expect(Object.keys(env)).not.toContain("PATH");
    expect(Object.keys(env)).not.toContain("NEXT_PUBLIC_FOO");
  });
});

describe("server and public schemas", () => {
  it("are documented in .env.example: every variable, nothing extra", () => {
    const declared = [
      ...Object.keys(serverEnvSchema.shape),
      ...Object.keys(publicEnvSchema.shape),
    ];

    expect(Object.keys(example).sort()).toEqual(declared.sort());
  });

  it("keep NEXT_PUBLIC_* variables apart", () => {
    for (const key of Object.keys(serverEnvSchema.shape)) {
      expect(key).not.toMatch(/^NEXT_PUBLIC_/);
    }
    for (const key of Object.keys(publicEnvSchema.shape)) {
      expect(key).toMatch(/^NEXT_PUBLIC_/);
    }
  });

  it("validate public variables with the same rules", () => {
    const schema = publicEnvSchema.extend({
      NEXT_PUBLIC_COUNTER_ID: serverEnvSchema.shape.S3_BUCKET,
    });

    expect(
      parseEnv(schema, { NEXT_PUBLIC_COUNTER_ID: "42" }, "public"),
    ).toEqual({ NEXT_PUBLIC_COUNTER_ID: "42" });
    expect(
      errorOf(() => parseEnv(schema, { NEXT_PUBLIC_COUNTER_ID: "" }, "public"))
        .message,
    ).toContain(
      "Invalid public environment variables:\n  - NEXT_PUBLIC_COUNTER_ID: is not set",
    );
  });
});
