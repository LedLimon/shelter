import { z } from "zod";

type EnvSource = Record<string, string | undefined>;

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const httpUrl = () =>
  z.url({ protocol: /^https?$/, error: "must be an http(s):// URL" });

const required = () => z.string().min(1);

const flag = () => z.stringbool({ error: "must be true or false" });

const portError = "must be a port number (1-65535)";
const port = () =>
  z.coerce
    .number({ error: portError })
    .int(portError)
    .min(1, portError)
    .max(65_535, portError);

/** Server-only variables. Never import their values into client code. */
export const serverEnvSchema = z
  .object({
    // Public origin of the site: links in emails, redirects, OG tags.
    APP_URL: httpUrl().transform((url) => url.replace(/\/+$/, "")),
    // Default shelter time zone; times are stored in UTC.
    SHELTER_TIMEZONE: z
      .string()
      .refine(isTimeZone, "must be an IANA time zone, e.g. Europe/Moscow")
      .default("Europe/Moscow"),

    DATABASE_URL: z.url({
      protocol: /^postgres(ql)?$/,
      error: "must be a postgresql:// URL",
    }),

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

    // Empty in dev; PAY-1 adds the fake provider and the provider switch.
    CLOUDPAYMENTS_PUBLIC_ID: z.string().optional(),
    CLOUDPAYMENTS_API_SECRET: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)) {
      ctx.addIssue({
        code: "custom",
        path: [env.SMTP_USER ? "SMTP_PASSWORD" : "SMTP_USER"],
        message: "SMTP_USER and SMTP_PASSWORD must be set together",
      });
    }
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
    const message =
      issue.code === "invalid_type" && input[key] === undefined
        ? "is not set"
        : issue.message;
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
