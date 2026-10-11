// The payment layer's contract (docs/payments.md#платёжный-слой, ADR-0002).
// Domain code talks to a PaymentProvider and to these types only: amounts are
// integer kopecks, times are Dates, and nothing here is CloudPayments-shaped.

export type PaymentProviderName = "cloudpayments" | "fake";

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** What a donation form asks the provider to charge. */
export type PaymentIntent = {
  /** Our Donation.id; the provider returns it in every webhook. */
  invoiceId: string;
  amountKop: number;
  /** Shown to the donor in the widget and on the bank statement. */
  description: string;
  email: string;
  /**
   * The provider's handle of the payer. CloudPayments needs it to start a
   * subscription and finds subscriptions by it.
   */
  accountId?: string;
  /**
   * Ours, returned in webhooks as PaymentEvent.metadata (target, needId…):
   * enough to create the Donation if the webhook outruns the intent's commit.
   */
  metadata: { [key: string]: JsonValue };
  /** Makes this payment the first of a monthly subscription. */
  recurrent?: {
    interval: "MONTH";
    /** Every `period` intervals. */
    period: number;
    /** Amount of the following charges, when it differs from the first. */
    amountKop?: number;
  };
  /**
   * Absolute URL the donor lands on after the widget, paid or not. The page
   * there must ask the server for the status: a redirect proves nothing.
   */
  returnUrl: string;
};

/** How the browser starts the payment. */
export type WidgetParams =
  | {
      /** Load `scriptUrl`, then `new cp.CloudPayments().start(options)`. */
      kind: "cloudpayments";
      scriptUrl: string;
      options: CloudPaymentsWidgetOptions;
    }
  /** Navigate to `url`; the donor comes back to PaymentIntent.returnUrl. */
  | { kind: "redirect"; url: string };

/**
 * `intentParams` of CloudPayments' widget. The only place where an amount is
 * a number of rubles: that is the widget's format.
 */
export type CloudPaymentsWidgetOptions = {
  publicTerminalId: string;
  amount: number;
  currency: "RUB";
  /** One-stage payment: charged at once, no separate confirmation. */
  paymentSchema: "Single";
  culture: "ru-RU";
  description: string;
  /** Comes back as InvoiceId. */
  externalId: string;
  userInfo: { email: string; accountId?: string };
  /** Comes back as Data. */
  metadata: { [key: string]: JsonValue };
  recurrent?: { interval: "Month"; period: number; amount?: number };
  successRedirectUrl: string;
  failRedirectUrl: string;
};

export const WEBHOOK_TYPES = [
  "check",
  "pay",
  "fail",
  "refund",
  "recurrent",
] as const;

export type WebhookType = (typeof WEBHOOK_TYPES)[number];

export type IncomingWebhook = {
  /** The body exactly as received (`await request.text()`), never re-encoded. */
  rawBody: string;
  headers: Headers;
};

/** A card or SBP charge as the provider reports it. */
export type ChargeDetails = {
  /** The provider's id of the transaction (Donation.providerTxId). */
  providerTxId: string;
  /** PaymentIntent.invoiceId; null for charges the provider starts itself (subscriptions). */
  invoiceId: string | null;
  amountKop: number;
  /** When the provider created the transaction. */
  occurredAt: Date;
  /** The provider's test terminal: no real money moved. */
  testMode: boolean;
  accountId: string | null;
  email: string | null;
  /** Set on the first payment of a subscription and on its every charge. */
  subscriptionId: string | null;
  /** The provider's name of the payment method (SBP, T-Pay…); null for a card. */
  method: string | null;
  /**
   * PaymentIntent.metadata as the provider returned it. It travelled through
   * the donor's browser: validate it before use and never trust it over our
   * own records.
   */
  metadata: JsonValue | null;
};

type EventBase = {
  /**
   * The same for every delivery of one notification: the WebhookEvent.dedupeKey
   * (`cp:pay:{TransactionId}`).
   */
  dedupeKey: string;
};

/** Asked before the charge: answer whether the payment may go through. */
export type CheckEvent = EventBase &
  ChargeDetails & { type: "check"; operation: "payment" | "refund" };

/** The money is charged. */
export type PayEvent = EventBase & ChargeDetails & { type: "pay" };

/**
 * An operation was declined. `operation` matters: a failed refund must not
 * mark the donation as failed.
 */
export type FailEvent = EventBase &
  ChargeDetails & {
    type: "fail";
    operation: "payment" | "refund";
    /** The provider's code of the reason, e.g. 5051 (insufficient funds). */
    reasonCode: number;
    reason: string;
  };

/** Money went back to the donor. */
export type RefundEvent = EventBase & {
  type: "refund";
  /** The refund's own transaction id. */
  refundTxId: string;
  /** The payment it returns (Donation.providerTxId). */
  paymentTxId: string;
  amountKop: number;
  occurredAt: Date;
  invoiceId: string | null;
  accountId: string | null;
  email: string | null;
  metadata: JsonValue | null;
};

/** A subscription changed its status. */
export type RecurrentEvent = EventBase & {
  type: "recurrent";
  subscription: ProviderSubscription;
};

export type PaymentEvent =
  CheckEvent | PayEvent | FailEvent | RefundEvent | RecurrentEvent;

export type ProviderSubscriptionStatus =
  | "ACTIVE"
  /** One or two charges in a row failed; the provider keeps trying. */
  | "PAST_DUE"
  | "CANCELLED"
  /** Three charges in a row failed; final. */
  | "REJECTED"
  /** The planned number of charges is done; final. */
  | "EXPIRED";

export type ProviderSubscription = {
  id: string;
  accountId: string;
  email: string | null;
  amountKop: number;
  status: ProviderSubscriptionStatus;
  interval: "DAY" | "WEEK" | "MONTH";
  period: number;
  startAt: Date;
  lastChargeAt: Date | null;
  nextChargeAt: Date | null;
  successfulCharges: number;
  /** In a row; a successful charge resets it. */
  failedCharges: number;
};

export type ProviderTransactionStatus =
  | "AWAITING_AUTHENTICATION"
  | "AUTHORIZED"
  | "COMPLETED"
  | "CANCELLED"
  | "DECLINED";

/** A row of the provider's registry: reconciliation and fee import. */
export type ProviderTransaction = {
  providerTxId: string;
  kind: "payment" | "refund" | "payout";
  status: ProviderTransactionStatus;
  amountKop: number;
  /** The acquirer's fee for this transaction; null if the provider gave none. */
  feeKop: number | null;
  createdAt: Date;
  testMode: boolean;
  invoiceId: string | null;
  accountId: string | null;
  email: string | null;
  subscriptionId: string | null;
  /** For a refund: the payment it returns. */
  originalTxId: string | null;
  metadata: JsonValue | null;
};

export type RefundInput = {
  /** The payment to return (Donation.providerTxId). */
  providerTxId: string;
  amountKop: number;
  /**
   * `refund:{donationId}:{n}`. The provider replays its answer to a repeated
   * request with the same key, but remembers it for an hour only: record the
   * refund in our database before calling, and treat the provider's memory
   * as a guard against network retries, not as the idempotency.
   */
  idempotencyKey: string;
};

export type ListTransactionsInput = {
  /** Transactions created in [from, to). */
  from: Date;
  to: Date;
};

/**
 * A payment provider: CloudPayments in staging and production, FakeCloudPayments
 * in dev and CI. Get the configured one with getPaymentProvider().
 *
 * The API methods talk to the network: never call them inside an open database
 * transaction. They throw PaymentProviderError.
 */
export interface PaymentProvider {
  /** Stored in Donation.provider. */
  readonly name: PaymentProviderName;

  /** What the browser needs to start the payment. Throws on a malformed intent. */
  widgetParams(intent: PaymentIntent): WidgetParams;

  /**
   * Whether the webhook is signed by the provider. Call it on the raw body
   * before anything else; answer 401 to an unsigned one.
   */
  verifyWebhook(webhook: IncomingWebhook): boolean;

  /**
   * The event of a webhook that passed verifyWebhook(). Throws
   * WebhookParseError when the body isn't what the provider documents or is
   * something we don't accept (another currency, a two-stage payment):
   * answer with an error so that the provider retries, never with success.
   */
  parseWebhook(type: string, rawBody: string): PaymentEvent;

  /**
   * Asks for a refund; the money movement is confirmed by the `refund`
   * webhook. On an UNAVAILABLE error the outcome is unknown: repeat with the
   * same idempotencyKey.
   */
  refund(input: RefundInput): Promise<{ refundTxId: string }>;

  /** Stops future charges. Resolves once the provider confirmed. */
  cancelSubscription(input: { subscriptionId: string }): Promise<void>;

  /**
   * Changes the amount of future charges. CloudPayments reactivates a
   * cancelled or finished subscription on any change: check our status first.
   */
  updateSubscription(input: {
    subscriptionId: string;
    amountKop: number;
  }): Promise<ProviderSubscription>;

  /** The provider's registry for a period, oldest first. */
  listTransactions(
    input: ListTransactionsInput,
  ): Promise<ProviderTransaction[]>;
}
