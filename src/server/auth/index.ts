import "server-only";
import { getEnv } from "@/lib/env";
import { getDb } from "@/server/db";
import { createAuth, type Auth } from "./config";

export type { Auth, AuthSession } from "./config";

// Per module, not on globalThis like the database pool: the instance is cheap
// (all of them share getDb()), and dev reloads must pick up config changes.
let auth: Auth | undefined;

/**
 * The Better Auth instance of this server process. Created on first use, not
 * on import, for the same reason as getDb(): `next build` has no env.
 */
export function getAuth(): Auth {
  if (!auth) {
    const env = getEnv();
    auth = createAuth(getDb(), {
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.APP_URL,
    });
  }
  return auth;
}
