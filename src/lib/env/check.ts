import { getEnv } from "./index";
import { getPublicEnv } from "./public";
import { EnvValidationError } from "./schema";

/**
 * Start-up check for server processes: print what's wrong with the
 * environment and exit, instead of starting and failing on some request.
 */
export function checkEnvOrExit(): void {
  try {
    getEnv();
    getPublicEnv();
  } catch (error) {
    if (!(error instanceof EnvValidationError)) throw error;
    console.error(`\n${error.message}\n`);
    process.exit(1);
  }
}
