import { parseEnv, serverEnvSchema, type ServerEnv } from "./schema";

// Not `server-only`: the worker and scripts outside Next.js import this too.
if (typeof window !== "undefined") {
  throw new Error(
    "@/lib/env holds server secrets; use @/lib/env/public in client code.",
  );
}

let cached: ServerEnv | undefined;

/**
 * Validated server environment; throws EnvValidationError if it's invalid.
 * Call it inside functions, not at module level: `next build` imports route
 * modules and must not need runtime variables. Server start validates it
 * anyway (src/instrumentation.ts).
 */
export function getEnv(): ServerEnv {
  cached ??= parseEnv(serverEnvSchema, process.env, "server");
  return cached;
}
