export async function register() {
  // Next.js keeps serving 500s after a failed hook, so the check exits instead.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkEnvOrExit } = await import("@/lib/env/check");
    checkEnvOrExit();
  }
}
