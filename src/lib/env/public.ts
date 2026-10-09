import { parseEnv, publicEnvSchema, type PublicEnv } from "./schema";

let cached: PublicEnv | undefined;

/**
 * Validated NEXT_PUBLIC_* environment, safe for client code. Reference each
 * variable literally (`NEXT_PUBLIC_FOO: process.env.NEXT_PUBLIC_FOO`):
 * Next.js inlines only literal `process.env.NEXT_PUBLIC_*` accesses.
 */
export function getPublicEnv(): PublicEnv {
  cached ??= parseEnv(publicEnvSchema, {}, "public");
  return cached;
}
