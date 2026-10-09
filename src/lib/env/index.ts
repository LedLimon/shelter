import { parseEnv, serverEnvSchema } from "./schema";

// Not `server-only`: the worker and scripts outside Next.js import this too.
if (typeof window !== "undefined") {
  throw new Error(
    "@/lib/env holds server secrets; use @/lib/env/public in client code.",
  );
}

/** Validated server environment. Throws on import if a variable is invalid. */
export const env = parseEnv(serverEnvSchema, process.env, "server");
