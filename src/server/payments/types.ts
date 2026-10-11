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
   * subscription and finds subscriptions by it. An opaque id of ours, not the
   * email: it shows up in the provider's account and in webhooks.
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
  /**
   * «Повторить платёж» after a decline (the widget's default, set explicitly).
   * A declined attempt is therefore not the end: a `fail` may be followed by
   * a `pay` of the same invoice with another transaction id.
   */
  retryPayment: true;
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
  /**
   * The provider's test terminal: no real money moved. A `check` or `pay`
   * with it reaches a handler only if the provider `acceptsTestPayments`.
   */
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

/**
 * The money is charged: a fact to record whatever state our donation is in.
 * One invoice can be paid by a transaction other than the one that failed
 * before (a retry in the widget, the provider's fallback bank).
 */
export type PayEvent = EventBase & ChargeDetails & { type: "pay" };

/**
 * An attempt was declined — this transaction, not the invoice: a `pay` with
 * another transaction id may follow. `operation` matters too: a failed
 * refund must not mark the donation as failed.
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

/**
 * A subscription changed its status. The notification has no id of its own:
 * `dedupeKey` is derived from its body, so two changes with identical bodies
 * are one key. Apply it as a snapshot of the subscription (setting a status
 * twice changes nothing) and use the key to send the email once.
 */
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

/** A registry row we couldn't read: to be looked at by a person, not skipped. */
export type UnreadableTransaction = {
  /** Null if even the id was unreadable. */
  providerTxId: string | null;
  /** Names of the fields that were wrong; never their values. */
  fields: string[];
};

export type TransactionRegistry = {
  /** Oldest first. */
  transactions: ProviderTransaction[];
  /**
   * Rows of the period that didn't parse. A row stays in the provider's
   * registry forever, so one bad row must not block the rest of the day:
   * import what is readable and raise an alert about these.
   */
  unreadable: UnreadableTransaction[];
};

export type RefundInput = {
  /** The payment to return (Donation.providerTxId). */
  providerTxId: string;
  amountKop: number;
  /**
   * `refund:{donationId}:{n}`, printable ASCII. The provider replays its
   * answer to a repeated request with the same key, but remembers it for an
   * hour only: record the refund in our database before calling, and treat
   * the provider's memory as a guard against network retries, not as the
   * idempotency.
   */
  idempotencyKey: string;
};

export type ListTransactionsInput = {
  /** Transactions created in [from, to). */
  from: Date;
  to: Date;
};

/**
 * Our answer to a webhook, in our own terms; the provider turns it into its
 * wire format. Only a `check` can be refused: every other notification
 * reports a fact, which we either took ("ok") or must get again ("retry").
 */
export type WebhookReply =
  /** Received and recorded. For a `check`: the payment may go through. */
  | "ok"
  /** `check`: we know no such invoice. */
  | "unknown-invoice"
  /** `check`: the amount isn't the invoice's. */
  | "wrong-amount"
  /** `check`: this payment can't be accepted. */
  | "declined"
  /** `check`: the invoice is too old to pay. */
  | "expired"
  /** We failed to process it: deliver again later. */
  | "retry";

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

  /**
   * Whether payments of the provider's test terminal count here (staging,
   * dev). If not, a `check` or `pay` with `testMode` is refused before it
   * reaches a handler. Reconciliation must apply the same rule to the
   * registry: a test transaction is not money.
   */
  readonly acceptsTestPayments: boolean;

  /** What the browser needs to start the payment. Throws on a malformed intent. */
  widgetParams(intent: PaymentIntent): WidgetParams;

  /**
   * The event of an incoming webhook: checks the provider's signature of the
   * raw body, then parses it. `type` is the last segment of the URL it came
   * to. Throws WebhookSignatureError (answer 401, do nothing else) or
   * WebhookParseError (answer webhookResponse("retry"), never "ok").
   */
  receiveWebhook(type: string, webhook: IncomingWebhook): PaymentEvent;

  /**
   * The event of a body that receiveWebhook() accepted earlier and we stored
   * (reprocessing from the webhook journal). Never for a body that just
   * arrived: nothing is verified here.
   */
  parseStoredWebhook(type: string, rawBody: string): PaymentEvent;

  /** The HTTP response that tells the provider `reply`. */
  webhookResponse(reply: WebhookReply): Response;

  /**
   * Asks for a refund; the money movement is confirmed by the `refund`
   * webhook, which may arrive before this call returns. If the error's
   * outcome is "unknown", the refund may have happened: see
   * PaymentProviderError.
   */
  refund(input: RefundInput): Promise<{ refundTxId: string }>;

  /** Stops future charges. Resolves once the provider confirmed. */
  cancelSubscription(input: { subscriptionId: string }): Promise<void>;

  /** The subscription as the provider has it now. */
  getSubscription(input: {
    subscriptionId: string;
  }): Promise<ProviderSubscription>;

  /**
   * Changes the amount of future charges of a subscription that is still
   * charging (ACTIVE or PAST_DUE at the provider); any other is refused with
   * REJECTED. CloudPayments itself would reactivate a cancelled subscription
   * on any change — and charge a donor who had cancelled.
   */
  updateSubscription(input: {
    subscriptionId: string;
    amountKop: number;
  }): Promise<ProviderSubscription>;

  /** The provider's registry for a period. */
  listTransactions(input: ListTransactionsInput): Promise<TransactionRegistry>;
}
