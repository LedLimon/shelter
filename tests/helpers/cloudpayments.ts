// CloudPayments webhook simulator for tests: signed notifications built the
// way the provider sends them (docs/testing.md#платежи-в-тестах).
//
//   const webhook = payWebhook({ invoiceId: donation.id, amountKop: 150_000 });
//   const response = await POST(webhookRequest(webhook), …);
//
// By default they are signed for the app's provider in tests, FakeCloudPayments
// (PAYMENT_PROVIDER is empty in .env.example). Pass `apiSecret` to sign for a
// CloudPayments adapter created in the test.
import {
  deliveryResultOf,
  FAKE_API_SECRET,
  globalFakeState,
} from "@/server/payments/fake";
import {
  checkFields,
  failFields,
  payFields,
  recurrentFields,
  refundFields,
  signWebhook,
  simulateWebhook,
  type SimulatedCharge,
  type SimulatedRefund,
  type SimulatedWebhook,
  type WebhookFields,
} from "@/server/payments/fake/webhooks";
import type {
  IncomingWebhook,
  ProviderSubscription,
  WebhookType,
} from "@/server/payments/types";

export { DECLINE } from "@/server/payments/fake/webhooks";
export type { SimulatedWebhook, WebhookFields };

export type SimulatorOptions = {
  /** The API Secret the receiving provider verifies with. */
  apiSecret?: string;
  /** Raw fields to add, replace or (with null) drop. */
  fields?: WebhookFields;
};

// CloudPayments' ids are numbers of about this size.
let lastTransactionId = 3_100_000_000;

/** A transaction id no other call of this test file got. */
export function nextTransactionId(): string {
  lastTransactionId += 1;
  return String(lastTransactionId);
}

function build(
  type: WebhookType,
  fields: WebhookFields,
  { apiSecret = FAKE_API_SECRET, fields: overrides }: SimulatorOptions = {},
): SimulatedWebhook {
  return simulateWebhook(type, { ...fields, ...overrides }, apiSecret);
}

function chargeOf(overrides: Partial<SimulatedCharge>): SimulatedCharge {
  return {
    transactionId: nextTransactionId(),
    amountKop: 150_000,
    dateTime: new Date("2026-10-11T09:15:42Z"),
    invoiceId: "invoice-1",
    email: "donor@shelter.localhost",
    description: "Пожертвование",
    ...overrides,
  };
}

/** Check: sent before the charge, answered with { code: 0 } to let it through. */
export function checkWebhook(
  charge: Partial<SimulatedCharge> = {},
  options?: SimulatorOptions,
): SimulatedWebhook {
  return build("check", checkFields(chargeOf(charge)), options);
}

/** Pay: the money is charged. With `subscriptionId` — a subscription's charge. */
export function payWebhook(
  charge: Partial<SimulatedCharge> = {},
  options?: SimulatorOptions,
): SimulatedWebhook {
  return build("pay", payFields(chargeOf(charge)), options);
}

/** Fail: declined, by default for insufficient funds (see DECLINE). */
export function failWebhook(
  charge: Partial<SimulatedCharge> = {},
  options?: SimulatorOptions & {
    decline?: { reasonCode: number; reason: string };
  },
): SimulatedWebhook {
  return build("fail", failFields(chargeOf(charge), options?.decline), options);
}

export function refundWebhook(
  refund: Partial<SimulatedRefund> & { paymentTransactionId: string },
  options?: SimulatorOptions,
): SimulatedWebhook {
  return build(
    "refund",
    refundFields({
      transactionId: nextTransactionId(),
      amountKop: 150_000,
      dateTime: new Date("2026-10-12T14:02:55Z"),
      ...refund,
    }),
    options,
  );
}

/** Recurrent: a subscription changed its status. */
export function recurrentWebhook(
  subscription: Partial<ProviderSubscription> = {},
  options?: SimulatorOptions,
): SimulatedWebhook {
  return build(
    "recurrent",
    recurrentFields({
      id: "sc_8cf8a9338fb8ebf7202b08d09c938",
      accountId: "donor@shelter.localhost",
      email: "donor@shelter.localhost",
      amountKop: 50_000,
      status: "ACTIVE",
      interval: "MONTH",
      period: 1,
      lastChargeAt: new Date("2026-10-11T09:15:42Z"),
      nextChargeAt: new Date("2026-11-11T06:00:00Z"),
      successfulCharges: 1,
      failedCharges: 0,
      ...subscription,
    }),
    options,
  );
}

/** A correctly signed notification with an arbitrary body: for malformed ones. */
export function rawWebhook(
  type: WebhookType,
  body: string,
  apiSecret = FAKE_API_SECRET,
): SimulatedWebhook {
  return signWebhook(type, body, apiSecret);
}

/** The same notification with another body and the old signature. */
export function tamper(
  webhook: SimulatedWebhook,
  change: (body: string) => string,
): SimulatedWebhook {
  return { ...webhook, body: change(webhook.body) };
}

/** What PaymentProvider.verifyWebhook() takes. */
export function incoming(webhook: SimulatedWebhook): IncomingWebhook {
  return { rawBody: webhook.body, headers: new Headers(webhook.headers) };
}

/** The HTTP request CloudPayments would make to our endpoint. */
export function webhookRequest(
  webhook: SimulatedWebhook,
  origin = "http://localhost:3000",
): Request {
  return new Request(`${origin}/api/webhooks/cloudpayments/${webhook.type}`, {
    method: "POST",
    headers: webhook.headers,
    body: webhook.body,
  });
}

/**
 * Takes over the notifications the app's FakeCloudPayments sends (after
 * refund(), cancelSubscription() or a checkout): they go to `handle` instead
 * of HTTP — pass the route handler under test — or, without it, nowhere.
 * Returns the list every sent notification is appended to. Integration tests
 * start with it installed (tests/integration/setup), so nothing reaches a
 * dev server that happens to listen on APP_URL.
 *
 *   const sent = interceptFakeWebhooks((webhook) =>
 *     POST(webhookRequest(webhook), { params }),
 *   );
 *   await provider.refund(…);
 *   await provider.settled();
 */
export function interceptFakeWebhooks(
  handle?: (webhook: SimulatedWebhook) => Response | Promise<Response>,
): SimulatedWebhook[] {
  const sent: SimulatedWebhook[] = [];
  globalFakeState().deliver = async (webhook) => {
    sent.push(webhook);
    if (!handle) return { status: null, code: null };
    return deliveryResultOf(await handle(webhook));
  };
  return sent;
}
