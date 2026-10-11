import { readFileSync } from "node:fs";
import { parseEnv as parseDotenv } from "node:util";
import { describe, expect, it } from "vitest";
import {
  EnvValidationError,
  isLocalUrl,
  parseEnv,
  parseServerEnv,
  publicEnvSchema,
  seedEnvSchema,
  serverEnvSchema,
} from "./schema";

const example = parseDotenv(
  readFileSync(new URL("../../../.env.example", import.meta.url), "utf8"),
);

// .env.example leaves secrets empty; each environment generates its own.
const secrets = { BETTER_AUTH_SECRET: "x".repeat(32) };

const parseServer = (overrides: Record<string, string | undefined> = {}) =>
  parseEnv(serverEnvSchema, { ...example, ...secrets, ...overrides }, "server");

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
  it("accepts .env.example once the secrets are filled in", () => {
    const env = parseServer();

    expect(env.DATABASE_URL).toBe(
      "postgresql://shelter:shelter@localhost:5432/shelter",
    );
    expect(env.SMTP_PORT).toBe(1025);
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
    expect(env.SMTP_SECURE).toBe(false);
    expect(env.SMTP_FROM).toBe("no-reply@shelter.localhost");
  });

  it("ships no secrets in .env.example", () => {
    expect(example.BETTER_AUTH_SECRET).toBe("");
    expect(example.SEED_OWNER_PASSWORD).toBe("");
    expect(example.SEED_OWNER_TOTP_SECRET).toBe("");
    expect(
      errorOf(() => parseEnv(serverEnvSchema, example, "server")).message,
    ).toContain("  - BETTER_AUTH_SECRET: is not set");
  });

  it("rejects a short auth secret without printing it", () => {
    const error = errorOf(() => parseServer({ BETTER_AUTH_SECRET: "hunter2" }));

    expect(error.message).toContain(
      "  - BETTER_AUTH_SECRET: must be at least 32 characters",
    );
    expect(error.message).not.toContain("hunter2");
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
    ["SMTP_FROM", "Приют", "must be an address or"],
    ["SMTP_FROM", "a@x.ru, b@y.ru", "must be an address or"],
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

  it("takes the sender as an address, with a name or without", () => {
    expect(parseServer().SMTP_FROM).toBe("no-reply@shelter.localhost");
    expect(
      parseServer({ SMTP_FROM: "Приют <no-reply@shelter.localhost>" })
        .SMTP_FROM,
    ).toBe("Приют <no-reply@shelter.localhost>");
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
      APP_URL: "http://localhost:3000/",
      SHELTER_TIMEZONE: undefined,
      S3_FORCE_PATH_STYLE: undefined,
      SMTP_SECURE: "true",
      CLOUDPAYMENTS_PUBLIC_ID: "",
    });

    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.SHELTER_TIMEZONE).toBe("Europe/Moscow");
    expect(env.S3_FORCE_PATH_STYLE).toBe(false);
    expect(env.SMTP_SECURE).toBe(true);
    expect(env.CLOUDPAYMENTS_PUBLIC_ID).toBeUndefined();
  });

  describe("payment provider", () => {
    const keys = {
      CLOUDPAYMENTS_PUBLIC_ID: "pk_test",
      CLOUDPAYMENTS_API_SECRET: "api-secret-value",
    };

    it("is the fake on a local APP_URL unless set", () => {
      expect(example.PAYMENT_PROVIDER).toBe("");
      expect(parseServer().PAYMENT_PROVIDER).toBe("fake");
      expect(
        parseServer({ APP_URL: "http://127.0.0.1:3100" }).PAYMENT_PROVIDER,
      ).toBe("fake");
      expect(
        parseServer({ APP_URL: "http://shelter.localhost:3000" })
          .PAYMENT_PROVIDER,
      ).toBe("fake");
    });

    it.each([
      "https://priyut.example",
      "https://staging.priyut.example",
      "http://192.168.1.10:3000",
      "http://localhost.example.com",
      "http://127.0.0.1.example.com",
    ])("refuses the fake on %s", (APP_URL) => {
      for (const PAYMENT_PROVIDER of [undefined, "fake"]) {
        expect(
          errorOf(() => parseServer({ APP_URL, PAYMENT_PROVIDER })).message,
        ).toContain(
          "  - PAYMENT_PROVIDER: the fake provider charges no money and works only with a local APP_URL",
        );
      }
    });

    it("takes CloudPayments with both keys, on any APP_URL", () => {
      const env = parseServer({
        APP_URL: "https://priyut.example",
        PAYMENT_PROVIDER: "cloudpayments",
        ...keys,
      });

      expect(env.PAYMENT_PROVIDER).toBe("cloudpayments");
      expect(env.CLOUDPAYMENTS_PUBLIC_ID).toBe("pk_test");
      expect(
        parseServer({ PAYMENT_PROVIDER: "cloudpayments", ...keys })
          .PAYMENT_PROVIDER,
      ).toBe("cloudpayments");
    });

    it("requires both CloudPayments keys, without printing either", () => {
      const none = errorOf(() =>
        parseServer({ PAYMENT_PROVIDER: "cloudpayments" }),
      );
      expect(none.message).toContain(
        "  - CLOUDPAYMENTS_PUBLIC_ID: is required with PAYMENT_PROVIDER=cloudpayments",
      );
      expect(none.message).toContain(
        "  - CLOUDPAYMENTS_API_SECRET: is required with PAYMENT_PROVIDER=cloudpayments",
      );

      const one = errorOf(() =>
        parseServer({
          PAYMENT_PROVIDER: "cloudpayments",
          CLOUDPAYMENTS_PUBLIC_ID: keys.CLOUDPAYMENTS_PUBLIC_ID,
          CLOUDPAYMENTS_API_SECRET: "",
        }),
      );
      expect(one.message).toContain("  - CLOUDPAYMENTS_API_SECRET: ");
      expect(one.message).not.toContain("CLOUDPAYMENTS_PUBLIC_ID");
      expect(one.message).not.toContain("pk_test");
    });

    it("rejects an unknown provider", () => {
      expect(
        errorOf(() => parseServer({ PAYMENT_PROVIDER: "yookassa" })).message,
      ).toContain('  - PAYMENT_PROVIDER: must be "cloudpayments" or "fake"');
    });

    it("ships no CloudPayments keys in .env.example", () => {
      expect(example.CLOUDPAYMENTS_PUBLIC_ID).toBe("");
      expect(example.CLOUDPAYMENTS_API_SECRET).toBe("");
    });

    it("accepts test payments only when told to", () => {
      expect(example.CLOUDPAYMENTS_ACCEPT_TEST_PAYMENTS).toBe("");
      expect(parseServer().CLOUDPAYMENTS_ACCEPT_TEST_PAYMENTS).toBe(false);
      expect(
        parseServer({ CLOUDPAYMENTS_ACCEPT_TEST_PAYMENTS: "true" })
          .CLOUDPAYMENTS_ACCEPT_TEST_PAYMENTS,
      ).toBe(true);
      expect(
        errorOf(() =>
          parseServer({ CLOUDPAYMENTS_ACCEPT_TEST_PAYMENTS: "sometimes" }),
        ).message,
      ).toContain(
        "  - CLOUDPAYMENTS_ACCEPT_TEST_PAYMENTS: must be true or false",
      );
    });

    describe("in a production build", () => {
      const source = { ...example, ...secrets };
      const production = (overrides: Record<string, string | undefined>) =>
        parseServerEnv({ ...source, ...overrides }, "production");

      it("has no default: a forgotten variable must not mean the emulator", () => {
        for (const PAYMENT_PROVIDER of [undefined, ""]) {
          expect(
            errorOf(() => production({ PAYMENT_PROVIDER })).message,
          ).toContain("  - PAYMENT_PROVIDER: is not set");
        }
      });

      it("takes a provider named explicitly", () => {
        // CI runs the production build against the emulator, on 127.0.0.1.
        expect(production({ PAYMENT_PROVIDER: "fake" }).PAYMENT_PROVIDER).toBe(
          "fake",
        );
        expect(
          production({
            APP_URL: "https://priyut.example",
            PAYMENT_PROVIDER: "cloudpayments",
            ...keys,
          }).PAYMENT_PROVIDER,
        ).toBe("cloudpayments");
      });

      it("still refuses the emulator on a public address", () => {
        expect(
          errorOf(() =>
            production({
              APP_URL: "https://priyut.example",
              PAYMENT_PROVIDER: "fake",
            }),
          ).message,
        ).toContain("  - PAYMENT_PROVIDER: the fake provider charges no money");
      });

      it("keeps the default in development and tests", () => {
        for (const nodeEnv of ["development", "test", undefined]) {
          expect(parseServerEnv(source, nodeEnv).PAYMENT_PROVIDER).toBe("fake");
        }
      });
    });
  });

  it("returns only declared variables", () => {
    const env = parseServer({ PATH: "/usr/bin", NEXT_PUBLIC_FOO: "x" });

    expect(Object.keys(env)).not.toContain("PATH");
    expect(Object.keys(env)).not.toContain("NEXT_PUBLIC_FOO");
  });
});

describe("seed env", () => {
  it("accepts .env.example and lowercases the owner email", () => {
    const env = parseEnv(
      seedEnvSchema,
      { ...example, ...secrets, SEED_OWNER_EMAIL: "Owner@Shelter.Localhost" },
      "seed",
    );

    expect(env).toEqual({
      DATABASE_URL: "postgresql://shelter:shelter@localhost:5432/shelter",
      APP_URL: "http://localhost:3000",
      SHELTER_TIMEZONE: "Europe/Moscow",
      BETTER_AUTH_SECRET: secrets.BETTER_AUTH_SECRET,
      SEED_OWNER_EMAIL: "owner@shelter.localhost",
    });
  });

  it("takes an optional owner password and TOTP secret, with minimum lengths", () => {
    const parseSeed = (overrides: Record<string, string>) =>
      parseEnv(seedEnvSchema, { ...example, ...secrets, ...overrides }, "seed");

    expect(
      parseSeed({
        SEED_OWNER_PASSWORD: "twelve chars",
        SEED_OWNER_TOTP_SECRET: "sixteen-chars-ok",
      }),
    ).toMatchObject({
      SEED_OWNER_PASSWORD: "twelve chars",
      SEED_OWNER_TOTP_SECRET: "sixteen-chars-ok",
    });
    expect(
      errorOf(() => parseSeed({ SEED_OWNER_PASSWORD: "short" })).message,
    ).toContain("  - SEED_OWNER_PASSWORD: must be at least 12 characters");
    expect(
      errorOf(() => parseSeed({ SEED_OWNER_TOTP_SECRET: "short" })).message,
    ).toContain("  - SEED_OWNER_TOTP_SECRET: must be at least 16 characters");
  });

  it("requires a valid owner email", () => {
    expect(
      errorOf(() =>
        parseEnv(
          seedEnvSchema,
          { ...example, ...secrets, SEED_OWNER_EMAIL: "" },
          "seed",
        ),
      ).message,
    ).toContain("  - SEED_OWNER_EMAIL: is not set");
    expect(
      errorOf(() =>
        parseEnv(
          seedEnvSchema,
          { ...example, ...secrets, SEED_OWNER_EMAIL: "owner" },
          "seed",
        ),
      ).message,
    ).toContain("  - SEED_OWNER_EMAIL: must be an email address");
  });
});

describe("env schemas", () => {
  const serverSideKeys = [
    ...Object.keys(serverEnvSchema.shape),
    ...Object.keys(seedEnvSchema.shape),
  ];

  it("are documented in .env.example: every variable, nothing extra", () => {
    const declared = new Set([
      ...serverSideKeys,
      ...Object.keys(publicEnvSchema.shape),
    ]);

    expect(Object.keys(example).sort()).toEqual([...declared].sort());
  });

  it("keep NEXT_PUBLIC_* variables apart", () => {
    for (const key of serverSideKeys) {
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

describe("isLocalUrl", () => {
  it.each([
    "http://localhost:3000",
    "http://localhost",
    "https://shelter.localhost",
    "http://127.0.0.1:3100",
    "http://[::1]:3000",
  ])("%s is this machine", (url) => {
    expect(isLocalUrl(url)).toBe(true);
  });

  it.each([
    "https://priyut.example",
    "http://localhost.example.com",
    "http://localhost@evil.example",
    "http://127.0.0.1.nip.io",
    "http://127.0.0.2",
    "http://0.0.0.0:3000",
    "http://192.168.1.10:3000",
    "http://10.0.0.5",
    "http://notlocalhost",
  ])("%s is not", (url) => {
    expect(isLocalUrl(url)).toBe(false);
  });
});
