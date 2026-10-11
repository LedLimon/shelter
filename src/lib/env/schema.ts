import { z } from "zod";
import { MIN_PASSWORD_LENGTH } from "@/server/auth/policy";

type EnvSource = Record<string, string | undefined>;

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const httpUrl = () =>
  z.url({ protocol: /^https?$/, error: "must be an http(s):// URL" });

const appUrl = () => httpUrl().transform((url) => url.replace(/\/+$/, ""));

const required = () => z.string().min(1);

const flag = () => z.stringbool({ error: "must be true or false" });

const databaseUrl = () =>
  z.url({ protocol: /^postgres(ql)?$/, error: "must be a postgresql:// URL" });

const timeZone = () =>
  z
    .string()
    .refine(isTimeZone, "must be an IANA time zone, e.g. Europe/Moscow")
    .default("Europe/Moscow");

// Better Auth signs cookies and encrypts TOTP secrets with it.
const authSecret = () =>
  z.string().min(32, "must be at least 32 characters: openssl rand -base64 32");

/** Whether the URL points at this machine: localhost, *.localhost, loopback. */
export function isLocalUrl(url: string): boolean {
  const { hostname } = new URL(url);
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

const portError = "must be a port number (1-65535)";
const port = () =>
  z.coerce
    .number({ error: portError })
    .int(portError)
    .min(1, portError)
    .max(65_535, portError);

const paymentProvider = () =>
  z.enum(["cloudpayments", "fake"], {
    error: 'must be "cloudpayments" or "fake"',
  });

type PaymentProviderSchema = z.ZodType<
  "cloudpayments" | "fake",
  "cloudpayments" | "fake" | undefined
>;

const serverEnv = (provider: PaymentProviderSchema) =>
  z
    .object({
      // Public origin of the site: links in emails, redirects, OG tags. Sign-in
      // requests from any other origin are rejected (CSRF check).
      APP_URL: appUrl(),
      // Fallback until the shelter.timezone setting exists (the seed copies
      // this value there). Times are stored in UTC.
      SHELTER_TIMEZONE: timeZone(),

      DATABASE_URL: databaseUrl(),

      BETTER_AUTH_SECRET: authSecret(),

      S3_ENDPOINT: httpUrl(),
      S3_REGION: required(),
      S3_BUCKET: required(),
      S3_ACCESS_KEY_ID: required(),
      S3_SECRET_ACCESS_KEY: required(),
      // MinIO needs path-style URLs (endpoint/bucket/key).
      S3_FORCE_PATH_STYLE: flag().default(false),

      SMTP_HOST: required(),
      SMTP_PORT: port(),
      // true = TLS from the start (port 465); false = plain or STARTTLS.
      SMTP_SECURE: flag().default(false),
      SMTP_USER: z.string().optional(),
      SMTP_PASSWORD: z.string().optional(),
      SMTP_FROM: required(),

      // Who takes the money (src/server/payments). "fake" is the emulator for
      // dev and CI: it charges nothing, so it is refused unless APP_URL is
      // this machine. Staging and production set "cloudpayments".
      PAYMENT_PROVIDER: provider,
      // The terminal's Public ID and API Secret (CloudPayments account). The
      // secret also signs webhooks.
      CLOUDPAYMENTS_PUBLIC_ID: z.string().optional(),
      CLOUDPAYMENTS_API_SECRET: z.string().optional(),
      // true only where the terminal is a test one (staging): payments of a
      // test terminal are not money and elsewhere are refused.
      CLOUDPAYMENTS_ACCEPT_TEST_PAYMENTS: flag().default(false),
    })
    .superRefine((env, ctx) => {
      if (env.PAYMENT_PROVIDER === "fake" && !isLocalUrl(env.APP_URL)) {
        ctx.addIssue({
          code: "custom",
          path: ["PAYMENT_PROVIDER"],
          message:
            "the fake provider charges no money and works only with a local APP_URL; set PAYMENT_PROVIDER=cloudpayments",
        });
      }
      if (env.PAYMENT_PROVIDER === "cloudpayments") {
        for (const key of [
          "CLOUDPAYMENTS_PUBLIC_ID",
          "CLOUDPAYMENTS_API_SECRET",
        ] as const) {
          if (env[key]) continue;
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "is required with PAYMENT_PROVIDER=cloudpayments",
          });
        }
      }
      if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)) {
        ctx.addIssue({
          code: "custom",
          path: [env.SMTP_USER ? "SMTP_PASSWORD" : "SMTP_USER"],
          message: "SMTP_USER and SMTP_PASSWORD must be set together",
        });
      }
    });

/**
 * Server-only variables. Never import their values into client code.
 * Without PAYMENT_PROVIDER the provider is the emulator — in dev and tests.
 */
export const serverEnvSchema = serverEnv(paymentProvider().default("fake"));

/**
 * A production build names its provider: a server must not end up with the
 * emulator because a variable was forgotten.
 */
const productionServerEnvSchema = serverEnv(paymentProvider());

/** Variables of `pnpm db:seed` (prisma/seed.ts); the app doesn't read them. */
export const seedEnvSchema = z.object({
  DATABASE_URL: databaseUrl(),
  APP_URL: appUrl(),
  // Written to the shelter.timezone setting.
  SHELTER_TIMEZONE: timeZone(),
  // The owner's password hash and TOTP secret are made with Better Auth.
  BETTER_AUTH_SECRET: authSecret(),
  // Becomes the OWNER while the database has none.
  SEED_OWNER_EMAIL: z
    .email({ error: "must be an email address" })
    .transform((email) => email.toLowerCase()),
  // Given to the owner only if they have no password yet; never overwritten.
  SEED_OWNER_PASSWORD: z
    .string()
    .min(
      MIN_PASSWORD_LENGTH,
      `must be at least ${MIN_PASSWORD_LENGTH} characters`,
    )
    .optional(),
  // Dev and tests only: a known TOTP secret instead of the setup screen, so
  // e2e can compute codes. The seed refuses it under NODE_ENV=production.
  SEED_OWNER_TOTP_SECRET: z
    .string()
    .min(16, "must be at least 16 characters")
    .optional(),
});

/**
 * Browser-visible variables (NEXT_PUBLIC_*). Next.js inlines them at build
 * time, so a Docker image keeps the values it was built with. Prefer passing
 * per-environment values from Server Components; use NEXT_PUBLIC_* only for
 * values that are the same in every environment built from one image.
 */
export const publicEnvSchema = z.object({});

export type ServerEnv = z.output<typeof serverEnvSchema>;
export type PublicEnv = z.output<typeof publicEnvSchema>;
export type SeedEnv = z.output<typeof seedEnvSchema>;

export class EnvValidationError extends Error {
  override name = "EnvValidationError";
}

/**
 * Validates only the variables declared in `schema`. Empty values count as
 * unset (`FOO=` in .env). The error lists variable names, never their values.
 */
export function parseEnv<Schema extends z.ZodObject>(
  schema: Schema,
  source: EnvSource,
  label: string,
): z.output<Schema> {
  const input: EnvSource = {};
  for (const key of Object.keys(schema.shape)) {
    const value = source[key];
    input[key] = value === "" ? undefined : value;
  }

  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const lines = result.error.issues.map((issue) => {
    const key = issue.path.join(".");
    const typeIssue =
      issue.code === "invalid_type" || issue.code === "invalid_value";
    const message =
      typeIssue && input[key] === undefined ? "is not set" : issue.message;
    return `  - ${key}: ${message}`;
  });

  throw new EnvValidationError(
    [
      `Invalid ${label} environment variables:`,
      ...lines,
      "Copy .env.example to .env and fill in the values (see README, «Dev-окружение»).",
    ].join("\n"),
  );
}

/** The server environment of a process running with this NODE_ENV. */
export function parseServerEnv(
  source: EnvSource,
  nodeEnv: string | undefined,
): ServerEnv {
  const schema =
    nodeEnv === "production" ? productionServerEnvSchema : serverEnvSchema;
  return parseEnv(schema, source, "server");
}
