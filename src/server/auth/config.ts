// Better Auth setup. Not `server-only`: the seed and e2e fixtures build the
// same instance outside Next.js to hash passwords and encrypt TOTP secrets
// exactly the way sign-in checks them. The app uses getAuth() from ./index.
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import type { PrismaClient } from "@/generated/prisma/client";
import { UserRole } from "@/generated/prisma/enums";
import { generateBackupCodes } from "./backup-codes";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  SESSION_EXPIRES_IN_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
  SIGN_IN_RATE_LIMIT,
  TWO_FACTOR_CHALLENGE_SECONDS,
  TWO_FACTOR_PATHS,
} from "./policy";

export type AuthConfig = {
  /** BETTER_AUTH_SECRET. */
  secret: string;
  /** APP_URL: the only origin sign-in requests are accepted from. */
  baseURL: string;
};

/**
 * Endpoints that Better Auth serves by default but staff sign-in must not
 * offer: open sign-up, editing one's own profile (staff are managed in the
 * admin), turning the mandatory second factor off, and reading the TOTP
 * secret again after setup.
 */
const DISABLED_PATHS = [
  "/sign-up/email",
  "/update-user",
  "/two-factor/disable",
  "/two-factor/get-totp-uri",
];

export function createAuth(db: PrismaClient, { secret, baseURL }: AuthConfig) {
  return betterAuth({
    appName: "Сайт приюта",
    baseURL,
    secret,
    database: prismaAdapter(db, { provider: "postgresql" }),
    // Better Auth would otherwise be able to report usage abroad (ADR-0004).
    telemetry: { enabled: false },
    disabledPaths: DISABLED_PATHS,

    emailAndPassword: {
      enabled: true,
      // Staff accounts are created by the owner (and the seed), never by visitors.
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
    },

    user: {
      additionalFields: {
        // Changed only in the admin; `input: false` keeps it out of every
        // Better Auth endpoint.
        role: {
          type: Object.values(UserRole),
          required: false,
          defaultValue: UserRole.DONOR,
          input: false,
        },
        deletedAt: { type: "date", required: false, input: false },
      },
    },

    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
      additionalFields: {
        twoFactorVerified: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
        },
      },
    },

    // Buckets per client IP and path, in Postgres: survives restarts and is
    // shared by every app instance. Enabled in dev too, so it's never a surprise.
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: { "/sign-in/email": SIGN_IN_RATE_LIMIT },
    },

    advanced: {
      // Ids come from the schema (`@default(cuid(2))`), like in every other table.
      database: { generateId: false },
      // Better Auth skips the origin (CSRF) check under NODE_ENV=test; tests
      // should see what production does.
      disableOriginCheck: false,
    },

    hooks: {
      // «Trust this device» would skip TOTP on later sign-ins; staff enter it
      // every time.
      before: createAuthMiddleware((ctx) => {
        const body = ctx.body as { trustDevice?: unknown } | undefined;
        if (TWO_FACTOR_PATHS.has(ctx.path) && body?.trustDevice) {
          throw new APIError("BAD_REQUEST", {
            message: "Trusted devices are not allowed",
          });
        }
        return Promise.resolve();
      }),
    },

    databaseHooks: {
      session: {
        create: {
          before: async (session, ctx) => {
            const user = await db.user.findUnique({
              where: { id: session.userId },
              select: { deletedAt: true },
            });
            // A deleted user can't sign in, whatever the method.
            if (!user || user.deletedAt) return false;

            // Marks sessions that passed the second factor. The admin trusts
            // only those, so a sign-in method added later (donor email codes)
            // can't open it for staff. Re-issued sessions keep the mark.
            const current = ctx?.context.session?.session as
              { twoFactorVerified?: boolean } | undefined;
            const twoFactorVerified =
              (ctx !== undefined &&
                ctx !== null &&
                TWO_FACTOR_PATHS.has(ctx.path)) ||
              current?.twoFactorVerified === true;
            return { data: { ...session, twoFactorVerified } };
          },
        },
      },
    },

    plugins: [
      twoFactor({
        // Shown in the authenticator app; the host tells staging from production.
        issuer: new URL(baseURL).host,
        twoFactorCookieMaxAge: TWO_FACTOR_CHALLENGE_SECONDS,
        // Defaults, written out: 10 wrong codes in a row lock sign-in for 15 min.
        accountLockout: { maxFailedAttempts: 10, durationSeconds: 15 * 60 },
        backupCodeOptions: { customBackupCodesGenerate: generateBackupCodes },
      }),
      // Lets server actions set auth cookies; must stay the last plugin.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth["$Infer"]["Session"];
