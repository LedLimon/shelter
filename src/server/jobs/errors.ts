import { z } from "zod";
import { maskPii } from "@/lib/pii";

// An error may quote a whole response body; nothing past this is looked at.
const MAX_INPUT_LENGTH = 2_000;
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

/** The same for a bare message, e.g. of an error that came as a plain object. */
export function describeMessage(message: string): string {
  // Control characters too: Postgres rejects a NUL in a text value, and the
  // outcome that carries this text would not be saved.
  return maskPii(message.slice(0, MAX_INPUT_LENGTH))
    .replace(/[\p{Cc}\s]+/gu, " ")
    .trim()
    .slice(0, MAX_LENGTH);
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
  return describeMessage(error.message);
}
