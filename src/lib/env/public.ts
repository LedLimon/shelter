import { parseEnv, publicEnvSchema } from "./schema";

/**
 * Validated NEXT_PUBLIC_* environment, safe for client code. Reference each
 * variable literally (`NEXT_PUBLIC_FOO: process.env.NEXT_PUBLIC_FOO`):
 * Next.js inlines only literal `process.env.NEXT_PUBLIC_*` accesses.
 */
export const publicEnv = parseEnv(publicEnvSchema, {}, "public");
