import { z } from "zod";
import { maskPii } from "@/lib/pii";

const MAX_LENGTH = 500;

/**
 * An error as one line for the log, Outbox.lastError and a failed job's
 * output: none of them may hold personal data (docs/legal.md). Emails and
 * long numbers are masked; a handler still shouldn't put names or addresses
 * into its errors.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return "a non-Error value was thrown";
  return `${error.name}: ${messageOf(error)}`.slice(0, MAX_LENGTH);
}

function messageOf(error: Error): string {
  if (error instanceof z.ZodError) {
    // Paths and expectations only, never the rejected values.
    return error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.code}`)
      .join("; ");
  }
  // Prisma messages quote the failed call with its arguments, and Postgres
  // errors inside them quote row values. Checked by name: the classes live
  // in the generated client and its runtime.
  if (error.name.startsWith("PrismaClient")) {
    return "code" in error && typeof error.code === "string"
      ? error.code
      : "message withheld (it quotes query arguments)";
  }
  return maskPii(error.message).replace(/\s+/g, " ").trim();
}
