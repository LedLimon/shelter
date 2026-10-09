import "server-only";
import { getEnv } from "@/lib/env";
import { getDb } from "@/server/db";
import { createAuth, type Auth } from "./config";

export type { Auth, AuthSession } from "./config";

const globalForAuth = globalThis as typeof globalThis & { shelterAuth?: Auth };

/**
 * The Better Auth instance of this server process. Created on first use, not
 * on import, for the same reason as getDb(): `next build` has no env.
 */
export function getAuth(): Auth {
  if (!globalForAuth.shelterAuth) {
    const env = getEnv();
    globalForAuth.shelterAuth = createAuth(getDb(), {
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.APP_URL,
    });
  }
  return globalForAuth.shelterAuth;
}
