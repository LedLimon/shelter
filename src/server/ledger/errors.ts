export type LedgerErrorCode =
  /** Arguments failed validation; nothing was written. */
  | "INVALID_INPUT"
  /** A write was called with the client instead of a transaction. */
  | "NOT_IN_TRANSACTION"
  /** The idempotency key is taken by a different transaction. */
  | "IDEMPOTENCY_CONFLICT"
  | "UNKNOWN_ACCOUNT"
  | "UNKNOWN_TRANSACTION"
  /**
   * A REVERSAL can't be reversed. To restore the original, post it again with
   * a new idempotency key (the old key would return the original as a no-op).
   */
  | "REVERSAL_OF_REVERSAL";

/**
 * A misuse of the ledger API, detected before anything reaches the database.
 * Violations the database catches (triggers, constraints) come as Prisma
 * errors with a message starting with "ledger:".
 */
export class LedgerError extends Error {
  readonly code: LedgerErrorCode;

  constructor(code: LedgerErrorCode, message: string) {
    super(`ledger: ${message}`);
    this.name = "LedgerError";
    this.code = code;
  }
}
