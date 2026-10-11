import { createAuthClient } from "better-auth/client";
import { twoFactorClient } from "better-auth/client/plugins";

/**
 * Browser side of Better Auth: requests to /api/auth on the current origin,
 * where rate limits and the origin check apply. Server code uses getAuth().
 */
export const authClient = createAuthClient({ plugins: [twoFactorClient()] });

/** What the forms need from a failed Better Auth request. */
export type AuthFailure = {
  status: number;
  code?: string | undefined;
  /** Seconds until the rate limit lets the next attempt through. */
  retryAfter?: number | undefined;
};

/**
 * Runs a Better Auth client call and returns its failure, if any. Network
 * errors become status 0; the X-Retry-After header of a 429 is kept.
 */
export async function attempt(
  call: (fetchOptions: {
    onError: (context: { response: Response }) => void;
  }) => Promise<{ error: { status: number; code?: string } | null }>,
): Promise<AuthFailure | null> {
  let retryAfter: number | undefined;
  try {
    const { error } = await call({
      onError: ({ response }) => {
        const header = Number(response.headers.get("X-Retry-After"));
        if (Number.isFinite(header) && header > 0) retryAfter = header;
      },
    });
    return error
      ? { status: error.status, code: error.code, retryAfter }
      : null;
  } catch {
    return { status: 0 };
  }
}
