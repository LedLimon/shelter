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

export type PaymentProviderErrorCode =
  /** Our arguments failed validation; nothing was sent. */
  | "INVALID_INPUT"
  /** The provider answered and refused (Success: false). */
  | "REJECTED"
  /** Wrong credentials (HTTP 401). */
  | "UNAUTHORIZED"
  /** Too many concurrent requests (HTTP 429). */
  | "RATE_LIMITED"
  /** Network error, timeout or HTTP 5xx: the outcome is unknown. */
  | "UNAVAILABLE"
  /** An answer we don't understand. */
  | "BAD_RESPONSE";

/**
 * A failed call to the provider's API. `retryable` — the same request (with
 * the same idempotency key) may succeed later; `outcomeUnknown` — see below. The message never carries our
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

  get retryable(): boolean {
    return this.code === "RATE_LIMITED" || this.code === "UNAVAILABLE";
  }

  /**
   * The provider may have done what we asked (a refund!) although we got no
   * readable answer. Don't record the operation as failed: repeat it with
   * the same idempotency key or look it up in the provider's registry.
   */
  get outcomeUnknown(): boolean {
    return this.code === "UNAVAILABLE" || this.code === "BAD_RESPONSE";
  }
}
