export type WebhookParseErrorCode =
  /** Not one of WEBHOOK_TYPES. */
  | "UNKNOWN_TYPE"
  /** The body isn't what the provider documents for this type. */
  | "MALFORMED"
  /** Well-formed, but not something we accept: currency, two-stage payment, payout. */
  | "UNSUPPORTED";

/**
 * A signed webhook we can't turn into an event. The message names fields,
 * never their values: bodies carry emails.
 */
export class WebhookParseError extends Error {
  readonly code: WebhookParseErrorCode;

  constructor(code: WebhookParseErrorCode, message: string) {
    super(`payments: ${message}`);
    this.name = "WebhookParseError";
    this.code = code;
  }
}

/** The webhook isn't signed by the provider: answer 401 and do nothing else. */
export class WebhookSignatureError extends Error {
  constructor() {
    super("payments: the webhook signature is missing or wrong");
    this.name = "WebhookSignatureError";
  }
}

export type PaymentProviderErrorCode =
  /** Our arguments failed validation; nothing was sent. */
  | "INVALID_INPUT"
  /** The provider answered and refused (Success: false). */
  | "REJECTED"
  /** Wrong credentials (HTTP 401). */
  | "UNAUTHORIZED"
  /** Too many concurrent requests (HTTP 429): the same request may pass later. */
  | "RATE_LIMITED"
  /** Network error, timeout or HTTP 5xx. */
  | "UNAVAILABLE"
  /** An answer we don't understand. */
  | "BAD_RESPONSE";

const UNKNOWN_OUTCOME: readonly PaymentProviderErrorCode[] = [
  "UNAVAILABLE",
  "BAD_RESPONSE",
];

/**
 * A failed call to the provider's API. The message never carries our
 * credentials or request data; the provider's own explanation of a REJECTED
 * request is in `providerMessage`, for the staff member who asked.
 */
export class PaymentProviderError extends Error {
  readonly code: PaymentProviderErrorCode;
  readonly providerMessage: string | null;

  constructor(
    code: PaymentProviderErrorCode,
    message: string,
    providerMessage: string | null = null,
  ) {
    super(`payments: ${message}`);
    this.name = "PaymentProviderError";
    this.code = code;
    this.providerMessage = providerMessage;
  }

  /**
   * Whether the provider did what we asked.
   *
   * "not-performed" — it certainly didn't.
   *
   * "unknown" — we got no readable answer, and the operation (a refund!) may
   * have gone through. Never record it as failed. Within an hour, repeat it
   * with the same idempotency key: the provider replays its first answer.
   * Later the provider has forgotten the key and would do it twice — first
   * look for the operation in listTransactions() (or wait for its webhook).
   * For the same reason a REJECTED answer to a repeat doesn't prove the
   * first attempt failed: "the amount exceeds the payment" is also what a
   * second full refund gets.
   */
  get outcome(): "not-performed" | "unknown" {
    return UNKNOWN_OUTCOME.includes(this.code) ? "unknown" : "not-performed";
  }
}
