import { isIP } from "node:net";

/** What is kept with a consent to show later that it was given (152-ФЗ). */
export type ConsentEvidence = {
  ip: string | null;
  userAgent: string | null;
};

const MAX_USER_AGENT_LENGTH = 512;

/**
 * The client's address and browser from the request's headers: pass
 * `await headers()` in a server action, `request.headers` in a route handler.
 * Both are personal data: they go to ConsentRecord and never to logs.
 *
 * The address is the first hop of X-Forwarded-For, as Better Auth reads it:
 * in production the app is reachable only through Caddy, which overwrites
 * the header (docs/architecture.md#вход-сотрудников).
 */
export function consentEvidence(headers: Headers): ConsentEvidence {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const userAgent = headers.get("user-agent")?.trim();
  return {
    // Anything that is not an address would only pollute the evidence.
    ip: forwarded && isIP(forwarded) ? forwarded : null,
    userAgent: userAgent ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
  };
}
