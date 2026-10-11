// FakeCloudPayments: the PaymentProvider of dev and CI. No network beyond our
// own server: the "widget" is a page of this site (/fake-cloudpayments), and
// the notifications it posts to our endpoint are signed and shaped exactly
// like CloudPayments' — the same code verifies and parses both.
//
// It keeps its "terminal" (payments, subscriptions) in memory: a server
// restart forgets it. Nothing here may be reachable in production — the
// environment check allows this provider only on a local APP_URL.
import { randomBytes } from "node:crypto";
import { isLocalHost } from "@/lib/env/schema";
import { cloudPaymentsWebhooks } from "../cloudpayments";
import { PaymentProviderError, WebhookSignatureError } from "../errors";
import {
  assertPaymentIntent,
  parsePeriod,
  parseRefundInput,
  parseSubscriptionInput,
  parseUpdateSubscriptionInput,
} from "../input";
import type {
  PaymentIntent,
  PaymentProvider,
  ProviderSubscription,
  ProviderTransaction,
  WebhookType,
} from "../types";
import {
  checkFields,
  DECLINE,
  failFields,
  payFields,
  recurrentFields,
  refundFields,
  simulateWebhook,
  type SimulatedCharge,
  type SimulatedWebhook,
  type WebhookFields,
} from "./webhooks";

/**
 * Signs the fake's notifications. Public on purpose: with this provider
 * anyone who reaches the site can "pay" without money anyway.
 */
export const FAKE_API_SECRET = "fake-cloudpayments-api-secret";

export const FAKE_CHECKOUT_PATH = "/fake-cloudpayments/checkout";
export const WEBHOOK_PATH = "/api/webhooks/cloudpayments";

/** CloudPayments waits this long for an answer to a notification. */
const DELIVERY_TIMEOUT_MS = 30_000;
/** How long CloudPayments remembers the answer to an X-Request-ID. */
const REQUEST_ID_TTL_MS = 60 * 60 * 1000;
const MAX_CHECKOUTS = 500;
const MAX_TRANSACTIONS = 5000;

export type DeliveryResult = {
  /** HTTP status of our endpoint; null if it didn't answer. */
  status: number | null;
  /** `code` of its JSON answer; null if there was none. */
  code: number | null;
};

/**
 * Takes a notification to `url` and reports the answer. If it throws (a
 * handler under test did), the error comes out of pay() or settled().
 */
export type Deliver = (
  webhook: SimulatedWebhook,
  url: string,
) => Promise<DeliveryResult>;

export type FakeDelivery = DeliveryResult & {
  webhook: SimulatedWebhook;
  /** Where it was posted. */
  url: string;
  /** HTTP 2xx with { code: 0 }: what CloudPayments takes for "received". */
  accepted: boolean;
};

export type FakeCheckoutStatus =
  | "open"
  /** A scenario is running; guards against a double click. */
  | "processing"
  | "awaiting-3ds"
  | "paid"
  | "declined"
  | "cancelled";

export type FakeDeclineReason =
  | "bank"
  | "3ds"
  /** Our Check handler refused the payment or didn't answer. */
  | "check";

export type FakeCheckout = {
  id: string;
  intent: PaymentIntent;
  status: FakeCheckoutStatus;
  declineReason: FakeDeclineReason | null;
  /** Of the last attempt: «Повторить платёж» starts a new transaction. */
  transactionId: string | null;
  /** When the donor pressed «Оплатить»: the transaction's time. */
  chargedAt: Date | null;
  /** Whether the last attempt sent Check: the widget's choice for a retry. */
  sendsCheck: boolean;
  subscriptionId: string | null;
  /** Notifications sent for this payment, in order. */
  deliveries: FakeDelivery[];
};

export type FakeScenario = {
  outcome: "success" | "decline" | "3ds";
  /**
   * Whether the terminal sends Check. CloudPayments declines a payment whose
   * Check isn't answered with { code: 0 }.
   */
  check: boolean;
};

/** Survives dev reloads on globalThis; plain data, no behaviour. */
export type FakeState = {
  checkouts: Map<string, FakeCheckout>;
  transactions: Map<string, ProviderTransaction>;
  subscriptions: Map<string, ProviderSubscription>;
  /** Answers to refund requests by idempotency key, and when they were given. */
  refunds: Map<string, { result: { refundTxId: string }; at: number }>;
  /** Notifications sent outside a checkout: refunds, subscription changes. */
  background: Set<Promise<unknown>>;
  /** What a replaced deliverer threw in the background; settled() rethrows it. */
  backgroundErrors: Error[];
  lastTransactionId: number;
  /**
   * Replaces the HTTP delivery: tests route notifications to a handler or
   * just record them, without touching whatever listens on APP_URL.
   */
  deliver: Deliver | null;
};

export function createFakeState(): FakeState {
  return {
    checkouts: new Map(),
    transactions: new Map(),
    subscriptions: new Map(),
    refunds: new Map(),
    background: new Set(),
    backgroundErrors: [],
    lastTransactionId: 0,
    deliver: null,
  };
}

const globalForFake = globalThis as typeof globalThis & {
  shelterFakePayments?: FakeState;
};

/**
 * The emulated terminal of this process: what getPaymentProvider() uses.
 * On globalThis, so dev reloads and separately bundled routes share it.
 * Another process (the worker) has its own, empty one.
 */
export function globalFakeState(): FakeState {
  globalForFake.shelterFakePayments ??= createFakeState();
  return globalForFake.shelterFakePayments;
}

export type FakeCloudPaymentsOptions = {
  /** Where our site listens: notifications go to `${appUrl}/api/webhooks/cloudpayments/{type}`. */
  appUrl: string;
  state?: FakeState;
  now?: () => Date;
};

export type FakeCloudPayments = PaymentProvider & {
  readonly name: "fake";
  getCheckout(id: string): FakeCheckout | undefined;
  /** The donor pressed «Оплатить» in the widget. */
  pay(checkoutId: string, scenario: FakeScenario): Promise<void>;
  /** The donor answered the bank's 3-D Secure page. */
  complete3ds(checkoutId: string, passed: boolean): Promise<void>;
  /** «Повторить платёж» after a decline: the widget is open again. */
  retry(checkoutId: string): void;
  /** The donor closed the widget without paying: no notifications. */
  cancel(checkoutId: string): void;
  /**
   * Resolves when notifications sent in the background are delivered;
   * rejects with what a deliverer threw while delivering one.
   */
  settled(): Promise<void>;
};

export function isFakeCloudPayments(
  provider: PaymentProvider,
): provider is FakeCloudPayments {
  return provider.name === "fake";
}

/** Reads our endpoint's answer the way CloudPayments does. */
export async function deliveryResultOf(
  response: Response,
): Promise<DeliveryResult> {
  const answer: unknown = await response.json().catch(() => null);
  const code =
    typeof answer === "object" && answer !== null && "code" in answer
      ? answer.code
      : null;
  return {
    status: response.status,
    code: typeof code === "number" ? code : null,
  };
}

/** Posts a notification the way CloudPayments does. */
export const httpDeliver: Deliver = async (webhook, url) => {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: webhook.headers,
      body: webhook.body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    return await deliveryResultOf(response);
  } catch {
    return { status: null, code: null };
  }
};

/** Drops the oldest entries of an insertion-ordered map. */
function trim(map: Map<string, unknown>, limit: number): void {
  for (const key of map.keys()) {
    if (map.size <= limit) break;
    map.delete(key);
  }
}

/** The same day `months` later, or the last day of a shorter month. */
function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return next;
}

/** A made-up acquirer's fee: 2.9 %, rounded to a kopeck in integers. */
function feeOf(amountKop: number): number {
  const scaled = amountKop * 29 + 500;
  return (scaled - (scaled % 1000)) / 1000;
}

/** The API answered Success: false. */
function refused(path: string, providerMessage: string): never {
  throw new PaymentProviderError(
    "REJECTED",
    `${path}: the fake refused the request`,
    providerMessage,
  );
}

export function createFakeCloudPayments(
  options: FakeCloudPaymentsOptions,
): FakeCloudPayments {
  const state = options.state ?? createFakeState();
  const now = options.now ?? (() => new Date());

  /**
   * Ids like CloudPayments' (up to 15 digits), unique across restarts: our
   * database outlives this process, and a repeated id would look like a
   * webhook retry.
   */
  function nextTransactionId(): string {
    state.lastTransactionId = Math.max(
      state.lastTransactionId + 1,
      now().getTime() * 100,
    );
    return String(state.lastTransactionId);
  }

  async function send(
    type: WebhookType,
    fields: WebhookFields,
  ): Promise<FakeDelivery> {
    const webhook = simulateWebhook(type, fields, FAKE_API_SECRET);
    const url = `${options.appUrl}${WEBHOOK_PATH}/${type}`;
    const result = await (state.deliver ?? httpDeliver)(webhook, url);
    const ok =
      result.status !== null && result.status >= 200 && result.status < 300;
    return { webhook, url, ...result, accepted: ok && result.code === 0 };
  }

  /** Not awaited by the caller, like a notification that follows an API call. */
  function sendInBackground(type: WebhookType, fields: WebhookFields): void {
    const delivery = send(type, fields)
      .catch((error: unknown) => {
        state.backgroundErrors.push(
          error instanceof Error ? error : new Error(String(error)),
        );
      })
      .finally(() => {
        state.background.delete(delivery);
      });
    state.background.add(delivery);
  }

  function chargeOf(checkout: FakeCheckout): SimulatedCharge {
    const { intent } = checkout;
    return {
      transactionId: checkout.transactionId!,
      amountKop: intent.amountKop,
      dateTime: checkout.chargedAt!,
      invoiceId: intent.invoiceId,
      accountId: intent.accountId,
      email: intent.email,
      subscriptionId: checkout.subscriptionId,
      description: intent.description,
      metadata: intent.metadata,
    };
  }

  function record(
    checkout: FakeCheckout,
    status: ProviderTransaction["status"],
  ): void {
    const { intent } = checkout;
    state.transactions.set(checkout.transactionId!, {
      providerTxId: checkout.transactionId!,
      kind: "payment",
      status,
      amountKop: intent.amountKop,
      feeKop: status === "COMPLETED" ? feeOf(intent.amountKop) : null,
      createdAt: checkout.chargedAt!,
      testMode: true,
      invoiceId: intent.invoiceId,
      accountId: intent.accountId ?? null,
      email: intent.email,
      subscriptionId: checkout.subscriptionId,
      originalTxId: null,
      metadata: intent.metadata,
    });
    trim(state.transactions, MAX_TRANSACTIONS);
  }

  function subscribe(checkout: FakeCheckout): void {
    const { recurrent, accountId, email, amountKop } = checkout.intent;
    if (!recurrent || !accountId) return;

    const subscription: ProviderSubscription = {
      id: `sc_${randomBytes(16).toString("hex")}`,
      accountId,
      email,
      amountKop: recurrent.amountKop ?? amountKop,
      status: "ACTIVE",
      interval: recurrent.interval,
      period: recurrent.period,
      lastChargeAt: checkout.chargedAt,
      nextChargeAt: addMonths(checkout.chargedAt!, recurrent.period),
      successfulCharges: 1,
      failedCharges: 0,
    };
    state.subscriptions.set(subscription.id, subscription);
    checkout.subscriptionId = subscription.id;
  }

  async function succeed(checkout: FakeCheckout): Promise<void> {
    subscribe(checkout);
    record(checkout, "COMPLETED");
    checkout.deliveries.push(await send("pay", payFields(chargeOf(checkout))));
    checkout.status = "paid";
  }

  async function decline(
    checkout: FakeCheckout,
    reason: Exclude<FakeDeclineReason, "check">,
  ): Promise<void> {
    record(checkout, "DECLINED");
    checkout.deliveries.push(
      await send(
        "fail",
        failFields(
          chargeOf(checkout),
          reason === "3ds"
            ? DECLINE.authenticationFailed
            : DECLINE.insufficientFunds,
        ),
      ),
    );
    checkout.status = "declined";
    checkout.declineReason = reason;
  }

  /**
   * Runs a step of the checkout if it is in `from`. The status changes before
   * the first await, so a second click finds nothing to do.
   */
  async function step(
    checkoutId: string,
    from: FakeCheckoutStatus,
    run: (checkout: FakeCheckout) => Promise<void>,
  ): Promise<void> {
    const checkout = state.checkouts.get(checkoutId);
    if (checkout?.status !== from) return;
    checkout.status = "processing";
    try {
      await run(checkout);
    } catch (error) {
      checkout.status = from;
      throw error;
    }
  }

  // Every payment of the fake is a test one: it has nothing else to take.
  const webhooks = cloudPaymentsWebhooks({
    apiSecret: FAKE_API_SECRET,
    acceptTestPayments: true,
  });

  function subscriptionOf(path: string, id: string): ProviderSubscription {
    return (
      state.subscriptions.get(id) ?? refused(path, "Subscription not found")
    );
  }

  return {
    name: "fake",

    ...webhooks,

    // The fake's secret is public, so its signature proves nothing to a
    // stranger. Like the emulator's pages, it serves only requests addressed
    // to this machine — a seat belt for a server that ended up behind a
    // proxy; the environment check is what keeps the fake off a public site.
    // No Host at all is a call made in this process (tests).
    receiveWebhook(type, webhook) {
      for (const name of ["host", "x-forwarded-host"]) {
        const host = webhook.headers.get(name);
        if (host !== null && !isLocalHost(host)) {
          throw new WebhookSignatureError();
        }
      }
      return webhooks.receiveWebhook(type, webhook);
    },

    widgetParams(intent) {
      assertPaymentIntent(intent);
      const id = randomBytes(16).toString("base64url");
      state.checkouts.set(id, {
        id,
        intent: structuredClone(intent),
        status: "open",
        declineReason: null,
        transactionId: null,
        chargedAt: null,
        sendsCheck: true,
        subscriptionId: null,
        deliveries: [],
      });
      trim(state.checkouts, MAX_CHECKOUTS);
      // A path, not `${appUrl}…`: the page is on whatever origin the donor uses.
      return { kind: "redirect", url: `${FAKE_CHECKOUT_PATH}/${id}` };
    },

    getCheckout: (id) => state.checkouts.get(id),

    pay: (checkoutId, scenario) =>
      step(checkoutId, "open", async (checkout) => {
        checkout.transactionId = nextTransactionId();
        checkout.chargedAt = now();
        checkout.declineReason = null;
        checkout.sendsCheck = scenario.check;

        if (scenario.check) {
          const check = await send("check", checkFields(chargeOf(checkout)));
          checkout.deliveries.push(check);
          if (!check.accepted) {
            record(checkout, "DECLINED");
            checkout.status = "declined";
            checkout.declineReason = "check";
            return;
          }
        }

        if (scenario.outcome === "3ds") {
          checkout.status = "awaiting-3ds";
        } else if (scenario.outcome === "success") {
          await succeed(checkout);
        } else {
          await decline(checkout, "bank");
        }
      }),

    complete3ds: (checkoutId, passed) =>
      step(checkoutId, "awaiting-3ds", (checkout) =>
        passed ? succeed(checkout) : decline(checkout, "3ds"),
      ),

    retry(checkoutId) {
      const checkout = state.checkouts.get(checkoutId);
      // The next attempt is a new transaction of the same invoice.
      if (checkout?.status === "declined") checkout.status = "open";
    },

    cancel(checkoutId) {
      const checkout = state.checkouts.get(checkoutId);
      if (checkout?.status === "open") checkout.status = "cancelled";
    },

    async settled() {
      while (state.background.size > 0) {
        await Promise.allSettled(state.background);
      }
      const [error] = state.backgroundErrors.splice(0);
      if (error) throw error;
    },

    // The API is emulated in memory, but answers like the network one: every
    // failure is a rejected promise.
    // eslint-disable-next-line @typescript-eslint/require-await
    async refund(input) {
      const { providerTxId, amountKop, idempotencyKey } =
        parseRefundInput(input);
      const at = now().getTime();
      // Like X-Request-ID: a repeated request gets the first answer — for an
      // hour. After that CloudPayments has forgotten it and refunds again.
      const repeated = state.refunds.get(idempotencyKey);
      if (repeated && at - repeated.at < REQUEST_ID_TTL_MS) {
        return repeated.result;
      }

      // A payment made before the last restart is unknown here; it is
      // refunded on trust, so that an old dev database stays usable.
      const payment = state.transactions.get(providerTxId);
      if (payment) {
        let refunded = 0;
        for (const transaction of state.transactions.values()) {
          if (transaction.originalTxId === providerTxId) {
            refunded += transaction.amountKop;
          }
        }
        const refundable =
          payment.kind === "payment" && payment.status === "COMPLETED"
            ? payment.amountKop - refunded
            : 0;
        if (amountKop > refundable) {
          refused("payments/refund", "Refund amount exceeds the payment");
        }
      }

      const refundTxId = nextTransactionId();
      state.transactions.set(refundTxId, {
        providerTxId: refundTxId,
        kind: "refund",
        status: "COMPLETED",
        amountKop,
        feeKop: null,
        createdAt: new Date(at),
        testMode: true,
        invoiceId: payment?.invoiceId ?? null,
        accountId: payment?.accountId ?? null,
        email: payment?.email ?? null,
        subscriptionId: null,
        originalTxId: providerTxId,
        metadata: payment?.metadata ?? null,
      });
      trim(state.transactions, MAX_TRANSACTIONS);
      const result = { refundTxId };
      state.refunds.delete(idempotencyKey);
      state.refunds.set(idempotencyKey, { result, at });
      trim(state.refunds, MAX_TRANSACTIONS);

      sendInBackground(
        "refund",
        refundFields({
          transactionId: refundTxId,
          paymentTransactionId: providerTxId,
          amountKop,
          dateTime: new Date(at),
          invoiceId: payment?.invoiceId,
          accountId: payment?.accountId,
          email: payment?.email,
          metadata: payment?.metadata,
        }),
      );
      return result;
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async cancelSubscription(input) {
      const { subscriptionId } = parseSubscriptionInput(input);
      const subscription = state.subscriptions.get(subscriptionId);
      // Unknown after a restart: nothing to stop, and that is what was asked.
      if (subscription && subscription.status !== "CANCELLED") {
        subscription.status = "CANCELLED";
        subscription.nextChargeAt = null;
        // Whether CloudPayments notifies about a cancellation made through
        // its API isn't documented; sending it makes handlers prove they
        // cope with both.
        sendInBackground("recurrent", recurrentFields(subscription));
      }
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async getSubscription(input) {
      const { subscriptionId } = parseSubscriptionInput(input);
      return { ...subscriptionOf("subscriptions/get", subscriptionId) };
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async updateSubscription(input) {
      const { subscriptionId, amountKop } = parseUpdateSubscriptionInput(input);
      const path = "subscriptions/update";
      const subscription = subscriptionOf(path, subscriptionId);
      // The adapter's own rule: only a subscription that still charges.
      if (
        subscription.status !== "ACTIVE" &&
        subscription.status !== "PAST_DUE"
      ) {
        refused(path, `Subscription is ${subscription.status}`);
      }
      // No notification follows a change made through the API.
      subscription.amountKop = amountKop;
      return { ...subscription };
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async listTransactions(input) {
      const { from, to } = parsePeriod(input);
      const found = [...state.transactions.values()].filter(
        ({ createdAt }) => createdAt >= from && createdAt < to,
      );
      found.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return {
        transactions: found.map((transaction) => ({ ...transaction })),
        // Every transaction here is a test one, and here they count.
        testTransactions: [],
        unreadable: [],
      };
    },
  };
}
