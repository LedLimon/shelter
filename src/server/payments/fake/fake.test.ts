import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkWebhook,
  failWebhook,
  incoming,
  payWebhook,
  rawWebhook,
  recurrentWebhook,
  refundWebhook,
  tamper,
  webhookRequest,
} from "../../../../tests/helpers/cloudpayments";
import { createCloudPayments } from "../cloudpayments";
import {
  PaymentProviderError,
  WebhookParseError,
  WebhookSignatureError,
} from "../errors";
import type { PaymentEvent, PaymentIntent } from "../types";
import {
  createFakeCloudPayments,
  createFakeState,
  FAKE_API_SECRET,
  httpDeliver,
  type DeliveryResult,
  type FakeCloudPayments,
} from "./index";
import type { SimulatedWebhook } from "./webhooks";

const APP_URL = "http://localhost:3000";
const NOW = new Date("2026-10-11T09:15:42.123Z");

/**
 * The real CloudPayments adapter with the fake's secret, as on staging: what
 * the emulator sends must pass the code that will face CloudPayments itself.
 */
const adapter = createCloudPayments({
  publicId: "pk_test",
  apiSecret: FAKE_API_SECRET,
  acceptTestPayments: true,
});

const INTENT: PaymentIntent = {
  invoiceId: "cm2donation0000000000001",
  amountKop: 150_050,
  description: "Пожертвование: корм на октябрь",
  email: "donor@shelter.localhost",
  metadata: { target: "NEED", needId: "need_korm_oct" },
  returnUrl: `${APP_URL}/donate/status/cm2donation0000000000001`,
};

type Answer = DeliveryResult | ((webhook: SimulatedWebhook) => DeliveryResult);
const ACCEPT: DeliveryResult = { status: 200, code: 0 };

/** A fake whose notifications land in `received` and get `answers` back. */
function setup(answers: Partial<Record<string, Answer>> = {}) {
  const received: SimulatedWebhook[] = [];
  const urls: string[] = [];
  const clock = { now: NOW };
  const state = createFakeState();
  state.deliver = (webhook, url) => {
    received.push(webhook);
    urls.push(url);
    const answer = answers[webhook.type] ?? ACCEPT;
    return Promise.resolve(
      typeof answer === "function" ? answer(webhook) : answer,
    );
  };
  const fake = createFakeCloudPayments({
    appUrl: APP_URL,
    state,
    now: () => clock.now,
  });
  return { fake, received, urls, clock, state };
}

function open(fake: FakeCloudPayments, intent: PaymentIntent = INTENT): string {
  const launch = fake.widgetParams(intent);
  if (launch.kind !== "redirect") throw new Error("expected a redirect");
  return launch.url.split("/").at(-1)!;
}

/** What a webhook handler does: the signature, then the body, in one call. */
function receive(webhook: SimulatedWebhook): PaymentEvent {
  return adapter.receiveWebhook(webhook.type, incoming(webhook));
}

async function errorOf(
  promise: Promise<unknown>,
): Promise<PaymentProviderError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PaymentProviderError) return error;
    throw error;
  }
  throw new Error("expected PaymentProviderError");
}

describe("the emulated widget", () => {
  it("opens a checkout page on our site, with no data in the URL", () => {
    const { fake } = setup();

    const launch = fake.widgetParams(INTENT);

    expect(launch.kind).toBe("redirect");
    expect(launch).toMatchObject({
      url: expect.stringMatching(
        /^\/fake-cloudpayments\/checkout\/[\w-]{22}$/,
      ) as string,
    });
    expect(fake.getCheckout(open(fake))).toMatchObject({
      status: "open",
      intent: INTENT,
      deliveries: [],
    });
  });

  it("refuses what CloudPayments' widget would not get either", () => {
    const { fake } = setup();

    expect(() => fake.widgetParams({ ...INTENT, amountKop: 0 })).toThrow(
      "invalid payment intent: amountKop",
    );
    expect(() =>
      fake.widgetParams({
        ...INTENT,
        recurrent: { interval: "MONTH", period: 1 },
      }),
    ).toThrow("invalid payment intent: accountId");
  });

  it("success: Check, then Pay, both as CloudPayments would send them", async () => {
    const { fake, received } = setup();
    const id = open(fake);

    await fake.pay(id, { outcome: "success", check: true });

    expect(received.map((webhook) => webhook.type)).toEqual(["check", "pay"]);
    const [check, pay] = received.map(receive);
    const charge = {
      invoiceId: INTENT.invoiceId,
      amountKop: 150_050,
      email: "donor@shelter.localhost",
      occurredAt: new Date("2026-10-11T09:15:42Z"),
      testMode: true,
      subscriptionId: null,
      metadata: INTENT.metadata,
    };
    expect(check).toMatchObject({
      type: "check",
      operation: "payment",
      ...charge,
    });
    expect(pay).toMatchObject({ type: "pay", ...charge });
    expect(pay).toHaveProperty(
      "providerTxId",
      fake.getCheckout(id)!.transactionId,
    );
    expect(check).toHaveProperty(
      "providerTxId",
      fake.getCheckout(id)!.transactionId,
    );

    expect(fake.getCheckout(id)).toMatchObject({
      status: "paid",
      declineReason: null,
      deliveries: [
        { accepted: true, status: 200, code: 0 },
        { accepted: true, status: 200, code: 0 },
      ],
    });
  });

  it("decline: Check, then Fail with the bank's reason", async () => {
    const { fake, received } = setup();
    const id = open(fake);

    await fake.pay(id, { outcome: "decline", check: true });

    expect(received.map((webhook) => webhook.type)).toEqual(["check", "fail"]);
    expect(receive(received[1]!)).toMatchObject({
      type: "fail",
      operation: "payment",
      reasonCode: 5051,
      reason: "InsufficientFunds",
      invoiceId: INTENT.invoiceId,
      amountKop: 150_050,
    });
    expect(fake.getCheckout(id)).toMatchObject({
      status: "declined",
      declineReason: "bank",
    });
  });

  it("3-D Secure: nothing is charged until the bank's page is passed", async () => {
    const { fake, received } = setup();
    const id = open(fake);

    await fake.pay(id, { outcome: "3ds", check: true });

    expect(received.map((webhook) => webhook.type)).toEqual(["check"]);
    expect(fake.getCheckout(id)!.status).toBe("awaiting-3ds");

    await fake.complete3ds(id, true);

    expect(received.map((webhook) => webhook.type)).toEqual(["check", "pay"]);
    expect(fake.getCheckout(id)!.status).toBe("paid");
  });

  it("3-D Secure failed: Fail with the authentication reason", async () => {
    const { fake, received } = setup();
    const id = open(fake);

    await fake.pay(id, { outcome: "3ds", check: true });
    await fake.complete3ds(id, false);

    expect(received.map((webhook) => webhook.type)).toEqual(["check", "fail"]);
    expect(receive(received[1]!)).toMatchObject({
      reasonCode: 5206,
      reason: "AuthenticationFailed",
    });
    expect(fake.getCheckout(id)).toMatchObject({
      status: "declined",
      declineReason: "3ds",
    });
  });

  it.each([
    ["refuses", { status: 200, code: 13 }],
    ["answers without a code", { status: 200, code: null }],
    ["fails", { status: 500, code: null }],
    ["is not there", { status: 404, code: null }],
    ["is unreachable", { status: null, code: null }],
    ["says 0 with an error status", { status: 500, code: 0 }],
  ])("declines the payment when our Check %s", async (_what, answer) => {
    const { fake, received } = setup({ check: answer });
    const id = open(fake);

    await fake.pay(id, { outcome: "success", check: true });

    // Like CloudPayments: no charge, so no Pay.
    expect(received.map((webhook) => webhook.type)).toEqual(["check"]);
    expect(fake.getCheckout(id)).toMatchObject({
      status: "declined",
      declineReason: "check",
      deliveries: [{ accepted: false }],
    });
  });

  it("skips Check when the terminal doesn't send it", async () => {
    const { fake, received } = setup({ check: { status: 404, code: null } });
    const id = open(fake);

    await fake.pay(id, { outcome: "success", check: false });

    expect(received.map((webhook) => webhook.type)).toEqual(["pay"]);
    expect(fake.getCheckout(id)!.status).toBe("paid");
  });

  it("charges even if our Pay handler fails: the money has moved", async () => {
    const { fake } = setup({ pay: { status: 500, code: null } });
    const id = open(fake);

    await fake.pay(id, { outcome: "success", check: true });

    expect(fake.getCheckout(id)).toMatchObject({
      status: "paid",
      deliveries: [{ accepted: true }, { accepted: false, status: 500 }],
    });
  });

  it("charges once however many times the button is pressed", async () => {
    const { fake, received } = setup();
    const id = open(fake);

    await Promise.all([
      fake.pay(id, { outcome: "success", check: true }),
      fake.pay(id, { outcome: "success", check: true }),
      fake.pay(id, { outcome: "decline", check: true }),
    ]);
    await fake.pay(id, { outcome: "success", check: true });
    await fake.complete3ds(id, true);
    fake.cancel(id);

    expect(received.map((webhook) => webhook.type)).toEqual(["check", "pay"]);
    expect(fake.getCheckout(id)!.status).toBe("paid");
  });

  it("lets the donor retry after a decline: the same invoice, a new transaction", async () => {
    const { fake, received } = setup();
    const id = open(fake);

    await fake.pay(id, { outcome: "decline", check: false });
    const declined = fake.getCheckout(id)!.transactionId;
    fake.retry(id);
    expect(fake.getCheckout(id)).toMatchObject({
      status: "open",
      declineReason: "bank",
    });
    await fake.pay(id, { outcome: "success", check: false });

    // What a handler must cope with: a fail, then a pay of the same invoice.
    const [fail, pay] = received.map(receive);
    expect(fail).toMatchObject({ type: "fail", invoiceId: INTENT.invoiceId });
    expect(pay).toMatchObject({ type: "pay", invoiceId: INTENT.invoiceId });
    expect(pay).toHaveProperty(
      "providerTxId",
      fake.getCheckout(id)!.transactionId,
    );
    expect(fail).toHaveProperty("providerTxId", declined);
    expect(fake.getCheckout(id)!.transactionId).not.toBe(declined);
    expect(fake.getCheckout(id)).toMatchObject({
      status: "paid",
      declineReason: null,
    });
    expect(fake.getCheckout(id)!.deliveries).toHaveLength(2);
  });

  it("offers a retry only after a decline", async () => {
    const { fake, received } = setup();
    const paid = open(fake);
    const cancelled = open(fake);
    await fake.pay(paid, { outcome: "success", check: false });
    fake.cancel(cancelled);

    fake.retry(paid);
    fake.retry(cancelled);
    fake.retry("nope");

    expect(fake.getCheckout(paid)!.status).toBe("paid");
    expect(fake.getCheckout(cancelled)!.status).toBe("cancelled");
    expect(received).toHaveLength(1);
  });

  it("posts to our webhook endpoint on APP_URL and remembers where", async () => {
    const { fake, urls } = setup();
    const id = open(fake);

    await fake.pay(id, { outcome: "success", check: true });

    expect(urls).toEqual([
      "http://localhost:3000/api/webhooks/cloudpayments/check",
      "http://localhost:3000/api/webhooks/cloudpayments/pay",
    ]);
    expect(fake.getCheckout(id)!.deliveries.map(({ url }) => url)).toEqual(
      urls,
    );
  });

  it("closing the widget sends nothing", async () => {
    const { fake, received } = setup();
    const id = open(fake);

    fake.cancel(id);
    await fake.pay(id, { outcome: "success", check: true });

    expect(received).toEqual([]);
    expect(fake.getCheckout(id)!.status).toBe("cancelled");
  });

  it("does nothing for an unknown checkout", async () => {
    const { fake, received } = setup();

    await fake.pay("nope", { outcome: "success", check: true });
    await fake.complete3ds("nope", true);
    fake.cancel("nope");

    expect(fake.getCheckout("nope")).toBeUndefined();
    expect(received).toEqual([]);
  });

  it("gives every payment its own transaction id", async () => {
    const { fake, received } = setup();

    for (let index = 0; index < 50; index++) {
      await fake.pay(open(fake), { outcome: "success", check: false });
    }

    const ids = received.map((webhook) => receive(webhook).dedupeKey);
    expect(new Set(ids).size).toBe(50);
    // …that the adapter's refund would take: a JSON number holds 15 digits.
    for (const { transactionId } of received
      .map((webhook) => receive(webhook) as { providerTxId: string })
      .map((event) => ({ transactionId: event.providerTxId }))) {
      expect(transactionId).toMatch(/^\d{15}$/);
    }
  });

  it("starts a subscription with the first payment", async () => {
    const { fake, received } = setup();
    const id = open(fake, {
      ...INTENT,
      accountId: "donor@shelter.localhost",
      recurrent: { interval: "MONTH", period: 1, amountKop: 50_000 },
    });

    await fake.pay(id, { outcome: "success", check: true });

    const [check, pay] = received.map(receive);
    const { subscriptionId } = fake.getCheckout(id)!;
    expect(subscriptionId).toMatch(/^sc_[0-9a-f]{32}$/);
    // The subscription exists only after the charge.
    expect(check).toMatchObject({ subscriptionId: null });
    expect(pay).toMatchObject({
      subscriptionId,
      accountId: "donor@shelter.localhost",
    });
  });

  it("starts no subscription when the first payment is declined", async () => {
    const { fake, received } = setup();
    const id = open(fake, {
      ...INTENT,
      accountId: "donor@shelter.localhost",
      recurrent: { interval: "MONTH", period: 1 },
    });

    await fake.pay(id, { outcome: "decline", check: true });

    expect(fake.getCheckout(id)!.subscriptionId).toBeNull();
    expect(receive(received[1]!)).toMatchObject({ subscriptionId: null });
  });
});

describe("the emulator sends what the adapter verifies", () => {
  it("is refused once the body or the secret differs", async () => {
    const { fake, received } = setup();
    await fake.pay(open(fake), { outcome: "success", check: true });
    const pay = received[1]!;
    const stranger = createCloudPayments({
      publicId: "pk_test",
      apiSecret: "another-terminal",
      acceptTestPayments: true,
    });
    const changed = tamper(pay, (body) => body.replace("1500.50", "9500.50"));

    expect(receive(pay)).toMatchObject({ type: "pay", amountKop: 150_050 });
    expect(fake.receiveWebhook("pay", incoming(pay))).toMatchObject({
      type: "pay",
    });
    expect(() => stranger.receiveWebhook("pay", incoming(pay))).toThrow(
      WebhookSignatureError,
    );
    expect(() => receive(changed)).toThrow(WebhookSignatureError);
    expect(() =>
      adapter.receiveWebhook("pay", {
        rawBody: pay.body,
        headers: new Headers(),
      }),
    ).toThrow(WebhookSignatureError);
  });

  it("checks the signature before it looks at the body or the type", () => {
    const unsigned = { rawBody: "not a notification", headers: new Headers() };

    // Not WebhookParseError: an unsigned sender learns nothing about parsing.
    expect(() => adapter.receiveWebhook("pay", unsigned)).toThrow(
      WebhookSignatureError,
    );
    expect(() => adapter.receiveWebhook("no-such-type", unsigned)).toThrow(
      WebhookSignatureError,
    );
  });

  it("signs the body, not its fields: another order is another body", () => {
    const pay = payWebhook();
    const reordered = tamper(pay, (body) =>
      body.split("&").reverse().join("&"),
    );

    expect(new URLSearchParams(reordered.body).get("Amount")).toBe("1500.00");
    expect(receive(pay)).toMatchObject({ type: "pay" });
    expect(() => receive(reordered)).toThrow(WebhookSignatureError);
  });

  it("is verified by Content-HMAC; X-Content-HMAC alone is not enough", () => {
    const pay = payWebhook({ description: "Корм на октябрь" });
    const headers = new Headers(pay.headers);

    // The two differ as soon as the body needs URL-encoding.
    expect(headers.get("X-Content-HMAC")).not.toBe(headers.get("Content-HMAC"));
    headers.set("Content-HMAC", headers.get("X-Content-HMAC")!);
    expect(() =>
      adapter.receiveWebhook("pay", { rawBody: pay.body, headers }),
    ).toThrow(WebhookSignatureError);

    headers.delete("Content-HMAC");
    expect(() =>
      adapter.receiveWebhook("pay", { rawBody: pay.body, headers }),
    ).toThrow(WebhookSignatureError);
  });

  it("can't pass a Check for a Pay: the emulator's bodies differ like the real ones", async () => {
    const { fake, received } = setup();
    await fake.pay(open(fake), { outcome: "success", check: true });
    const [check, pay] = received;

    // Signed, and still not a payment.
    expect(() => adapter.receiveWebhook("pay", incoming(check!))).toThrow(
      WebhookParseError,
    );
    expect(() => adapter.receiveWebhook("check", incoming(pay!))).toThrow(
      WebhookParseError,
    );
  });

  it("is refused on a live site: the emulator's payments are test ones", async () => {
    const { fake, received } = setup();
    await fake.pay(open(fake), { outcome: "success", check: true });
    const live = createCloudPayments({
      publicId: "pk_live",
      apiSecret: FAKE_API_SECRET,
      acceptTestPayments: false,
    });

    expect(fake.acceptsTestPayments).toBe(true);
    expect(live.acceptsTestPayments).toBe(false);
    for (const webhook of received) {
      expect(() =>
        live.receiveWebhook(webhook.type, incoming(webhook)),
      ).toThrow("test payments are not accepted here");
    }
  });

  it("covers every notification type of the helper", () => {
    const paymentTransactionId = "3059300327";
    const events = [
      checkWebhook(),
      payWebhook({ subscriptionId: "sc_1", invoiceId: null }),
      failWebhook(),
      refundWebhook({ paymentTransactionId, amountKop: 70_000 }),
      recurrentWebhook({ status: "REJECTED", failedCharges: 3 }),
    ].map(receive);

    expect(events.map((event) => event.type)).toEqual([
      "check",
      "pay",
      "fail",
      "refund",
      "recurrent",
    ]);
    expect(events[1]).toMatchObject({
      subscriptionId: "sc_1",
      invoiceId: null,
    });
    expect(events[3]).toMatchObject({
      paymentTxId: paymentTransactionId,
      amountKop: 70_000,
    });
    expect(events[4]).toMatchObject({
      subscription: { status: "REJECTED", failedCharges: 3 },
    });
  });

  it("builds the request CloudPayments would make", async () => {
    const pay = payWebhook({ invoiceId: "invoice-7" });

    const request = webhookRequest(pay);
    const rawBody = await request.text();

    expect(request.method).toBe("POST");
    expect(request.url).toBe(`${APP_URL}/api/webhooks/cloudpayments/pay`);
    expect(request.headers.get("Content-Type")).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(
      adapter.receiveWebhook("pay", { rawBody, headers: request.headers }),
    ).toMatchObject({ invoiceId: "invoice-7" });
    // The stored body of an accepted webhook parses to the same event.
    expect(adapter.parseStoredWebhook("pay", rawBody)).toEqual(
      adapter.receiveWebhook("pay", { rawBody, headers: request.headers }),
    );
  });

  it("can sign a malformed body, to test what handlers do with it", () => {
    const broken = rawWebhook("pay", "TransactionId=1&Amount=lots");

    expect(() => receive(broken)).toThrow(WebhookParseError);
    expect(() => receive(broken)).toThrow("missing or invalid");
  });

  // Whatever the donor typed must survive the trip through the form encoding.
  it("keeps any amount, text and metadata intact", () => {
    const text = fc.string({ unit: "grapheme", minLength: 1, maxLength: 40 });
    fc.assert(
      fc.property(
        fc.record({
          amountKop: fc.integer({ min: 1, max: 2_147_483_647 }),
          invoiceId: text.filter((value) => value.trim() !== ""),
          email: fc.emailAddress(),
          metadata: fc.dictionary(
            text,
            fc.oneof(text, fc.integer(), fc.boolean()),
          ),
          dateTime: fc.date({
            min: new Date("2000-01-01T00:00:00Z"),
            max: new Date("2100-01-01T00:00:00Z"),
            noInvalidDate: true,
          }),
        }),
        (charge) => {
          const webhook = payWebhook(charge);
          const event = receive(webhook);

          expect(event).toMatchObject({
            type: "pay",
            amountKop: charge.amountKop,
            invoiceId: charge.invoiceId,
            email: charge.email,
            metadata: charge.metadata,
          });
          expect(event).toHaveProperty(
            "occurredAt",
            new Date(Math.floor(charge.dateTime.getTime() / 1000) * 1000),
          );
          // Any change of the body breaks the signature.
          const changed = tamper(webhook, (body) => `${body}&Amount=1.00`);
          expect(() => receive(changed)).toThrow(WebhookSignatureError);
        },
      ),
    );
  });
});

describe("the emulated API", () => {
  async function paid(setupResult = setup(), intent: PaymentIntent = INTENT) {
    const { fake, received, clock } = setupResult;
    const id = open(fake, intent);
    await fake.pay(id, { outcome: "success", check: false });
    received.length = 0;
    return { fake, received, clock, checkout: fake.getCheckout(id)! };
  }

  it("refunds and notifies about it", async () => {
    const { fake, received, checkout } = await paid();
    const providerTxId = checkout.transactionId!;

    const { refundTxId } = await fake.refund({
      providerTxId,
      amountKop: 50_050,
      idempotencyKey: "refund:donation-1:1",
    });
    await fake.settled();

    expect(refundTxId).not.toBe(providerTxId);
    expect(received).toHaveLength(1);
    expect(receive(received[0]!)).toMatchObject({
      type: "refund",
      refundTxId,
      paymentTxId: providerTxId,
      amountKop: 50_050,
      invoiceId: INTENT.invoiceId,
      metadata: INTENT.metadata,
    });
  });

  it("repeats its answer for a repeated idempotency key, without a second refund", async () => {
    const { fake, received, checkout } = await paid();
    const input = {
      providerTxId: checkout.transactionId!,
      amountKop: 150_050,
      idempotencyKey: "refund:donation-1:1",
    };

    const [first, second] = await Promise.all([
      fake.refund(input),
      fake.refund(input),
    ]);
    const third = await fake.refund(input);
    await fake.settled();

    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(received).toHaveLength(1);
  });

  // The trap of X-Request-ID: CloudPayments remembers the answer for an hour.
  it("forgets the idempotency key after an hour, like CloudPayments", async () => {
    const { fake, received, clock, checkout } = await paid();
    const input = {
      providerTxId: checkout.transactionId!,
      amountKop: 50_000,
      idempotencyKey: "refund:donation-1:1",
    };
    const minutes = (count: number) => new Date(NOW.getTime() + count * 60_000);

    const first = await fake.refund(input);
    clock.now = minutes(59);
    const withinTheHour = await fake.refund(input);
    clock.now = minutes(61);
    const later = await fake.refund(input);
    await fake.settled();

    expect(withinTheHour).toEqual(first);
    // A repeat that late is a second refund: 500 ₽ went back twice.
    expect(later.refundTxId).not.toBe(first.refundTxId);
    expect(received).toHaveLength(2);
  });

  it("answers a late repeat of a full refund with a refusal, though the refund happened", async () => {
    const { fake, clock, checkout } = await paid();
    const input = {
      providerTxId: checkout.transactionId!,
      amountKop: 150_050,
      idempotencyKey: "refund:donation-1:1",
    };

    await fake.refund(input);
    clock.now = new Date(NOW.getTime() + 2 * 60 * 60_000);
    const error = await errorOf(fake.refund(input));

    // REJECTED here doesn't mean "not refunded": only the registry tells.
    expect(error.code).toBe("REJECTED");
    const { transactions } = await fake.listTransactions({
      from: new Date("2026-10-11T00:00:00Z"),
      to: new Date("2026-10-12T00:00:00Z"),
    });
    expect(
      transactions.filter(
        (transaction) => transaction.originalTxId === input.providerTxId,
      ),
    ).toHaveLength(1);
  });

  it("refuses to return more than was paid", async () => {
    const { fake, received, checkout } = await paid();
    const providerTxId = checkout.transactionId!;

    await fake.refund({
      providerTxId,
      amountKop: 100_000,
      idempotencyKey: "r:1",
    });
    const error = await errorOf(
      fake.refund({ providerTxId, amountKop: 50_051, idempotencyKey: "r:2" }),
    );
    await fake.refund({
      providerTxId,
      amountKop: 50_050,
      idempotencyKey: "r:3",
    });
    await fake.settled();

    expect(error.code).toBe("REJECTED");
    expect(error.outcome).toBe("not-performed");
    expect(error.providerMessage).toBe("Refund amount exceeds the payment");
    expect(received).toHaveLength(2);
  });

  it("refuses to refund a declined payment", async () => {
    const { fake } = setup();
    const id = open(fake);
    await fake.pay(id, { outcome: "decline", check: false });

    const error = await errorOf(
      fake.refund({
        providerTxId: fake.getCheckout(id)!.transactionId!,
        amountKop: 1,
        idempotencyKey: "r:1",
      }),
    );

    expect(error.code).toBe("REJECTED");
  });

  it("refunds a payment it forgot after a restart", async () => {
    const { fake, received } = setup();

    await fake.refund({
      providerTxId: "3059300327",
      amountKop: 70_000,
      idempotencyKey: "refund:donation-9:1",
    });
    await fake.settled();

    expect(receive(received[0]!)).toMatchObject({
      type: "refund",
      paymentTxId: "3059300327",
      amountKop: 70_000,
      invoiceId: null,
    });
  });

  const MONTHLY: PaymentIntent = {
    ...INTENT,
    accountId: "payer-1",
    recurrent: { interval: "MONTH", period: 1 },
  };

  it("cancels a subscription once and notifies about it", async () => {
    const { fake, received, checkout } = await paid(setup(), MONTHLY);
    const subscriptionId = checkout.subscriptionId!;

    await fake.cancelSubscription({ subscriptionId });
    await fake.cancelSubscription({ subscriptionId });
    await fake.cancelSubscription({ subscriptionId: "sc_forgotten" });
    await fake.settled();

    expect(received).toHaveLength(1);
    expect(receive(received[0]!)).toMatchObject({
      type: "recurrent",
      subscription: {
        id: subscriptionId,
        accountId: "payer-1",
        status: "CANCELLED",
        amountKop: 150_050,
        nextChargeAt: null,
      },
    });
    expect(await fake.getSubscription({ subscriptionId })).toMatchObject({
      status: "CANCELLED",
    });
  });

  it("changes the amount of an active subscription, without a notification", async () => {
    const { fake, received, checkout } = await paid(setup(), MONTHLY);
    const subscriptionId = checkout.subscriptionId!;

    const updated = await fake.updateSubscription({
      subscriptionId,
      amountKop: 30_000,
    });
    await fake.settled();

    expect(updated).toMatchObject({
      id: subscriptionId,
      amountKop: 30_000,
      status: "ACTIVE",
      nextChargeAt: new Date("2026-11-11T09:15:42.123Z"),
    });
    expect(await fake.getSubscription({ subscriptionId })).toEqual(updated);
    expect(received).toEqual([]);
  });

  // The provider's own API would reactivate it; ours must not.
  it("doesn't change — or reactivate — a cancelled subscription", async () => {
    const { fake, checkout } = await paid(setup(), MONTHLY);
    const subscriptionId = checkout.subscriptionId!;
    await fake.cancelSubscription({ subscriptionId });

    const error = await errorOf(
      fake.updateSubscription({ subscriptionId, amountKop: 30_000 }),
    );

    expect(error.code).toBe("REJECTED");
    expect(error.providerMessage).toBe("Subscription is CANCELLED");
    expect(await fake.getSubscription({ subscriptionId })).toMatchObject({
      status: "CANCELLED",
      amountKop: 150_050,
    });
  });

  it("knows nothing of a subscription made before a restart", async () => {
    const { fake } = setup();

    for (const call of [
      fake.getSubscription({ subscriptionId: "sc_nope" }),
      fake.updateSubscription({ subscriptionId: "sc_nope", amountKop: 100 }),
    ]) {
      const error = await errorOf(call);
      expect(error.code).toBe("REJECTED");
      expect(error.providerMessage).toBe("Subscription not found");
    }
  });

  it("puts the next charge on the last day of a shorter month", async () => {
    const setupResult = setup();
    setupResult.clock.now = new Date("2027-01-31T10:00:00Z");
    const { fake, checkout } = await paid(setupResult, MONTHLY);

    expect(
      await fake.getSubscription({ subscriptionId: checkout.subscriptionId! }),
    ).toMatchObject({ nextChargeAt: new Date("2027-02-28T10:00:00Z") });
  });

  it("lists payments, declines and refunds of a period, with fees", async () => {
    const { fake } = setup();
    const first = open(fake);
    const second = open(fake, {
      ...INTENT,
      invoiceId: "invoice-2",
      amountKop: 10_000,
    });
    await fake.pay(first, { outcome: "success", check: false });
    await fake.pay(second, { outcome: "decline", check: false });
    const { refundTxId } = await fake.refund({
      providerTxId: fake.getCheckout(first)!.transactionId!,
      amountKop: 50,
      idempotencyKey: "r:1",
    });
    await fake.settled();

    const day = {
      from: new Date("2026-10-11T00:00:00Z"),
      to: new Date("2026-10-12T00:00:00Z"),
    };
    const { transactions, unreadable } = await fake.listTransactions(day);

    expect(unreadable).toEqual([]);
    expect(transactions).toHaveLength(3);
    expect(transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerTxId: fake.getCheckout(first)!.transactionId,
          kind: "payment",
          status: "COMPLETED",
          amountKop: 150_050,
          // 2.9 % of 1500.50 ₽, to a kopeck.
          feeKop: 4351,
          testMode: true,
          invoiceId: INTENT.invoiceId,
        }),
        expect.objectContaining({
          kind: "payment",
          status: "DECLINED",
          feeKop: null,
          invoiceId: "invoice-2",
        }),
        expect.objectContaining({
          providerTxId: refundTxId,
          kind: "refund",
          amountKop: 50,
          originalTxId: fake.getCheckout(first)!.transactionId,
        }),
      ]),
    );
    expect(
      (
        await fake.listTransactions({
          from: day.to,
          to: new Date("2026-10-13T00:00:00Z"),
        })
      ).transactions,
    ).toEqual([]);
    // [from, to): a transaction at `to` belongs to the next period.
    expect(
      (await fake.listTransactions({ from: day.from, to: NOW })).transactions,
    ).toEqual([]);
  });
});

// A handler tested on the emulator must not meet its first refusal in
// production: both providers check arguments with the same code.
describe("the emulator refuses what the adapter refuses", () => {
  const cloudPayments = createCloudPayments({
    publicId: "pk_test",
    apiSecret: "test-api-secret",
    acceptTestPayments: true,
    fetch: () => Promise.reject(new Error("must not be called")),
  });
  const { fake, received } = setup();
  const refund = {
    providerTxId: "3059300327",
    amountKop: 100,
    idempotencyKey: "refund:donation-1:1",
  };
  const day = {
    from: new Date("2026-10-11T00:00:00Z"),
    to: new Date("2026-10-12T00:00:00Z"),
  };

  it.each([
    [
      "refund: our id instead of the provider's",
      (p: typeof fake) =>
        p.refund({ ...refund, providerTxId: "cm2donation0000000000001" }),
    ],
    [
      "refund: a transaction id over 15 digits",
      (p: typeof fake) =>
        p.refund({ ...refund, providerTxId: "1234567890123456" }),
    ],
    [
      "refund: a fractional amount",
      (p: typeof fake) => p.refund({ ...refund, amountKop: 0.5 }),
    ],
    [
      "refund: a zero amount",
      (p: typeof fake) => p.refund({ ...refund, amountKop: 0 }),
    ],
    [
      "refund: an amount over Int",
      (p: typeof fake) => p.refund({ ...refund, amountKop: 3_000_000_000 }),
    ],
    [
      "refund: an empty idempotency key",
      (p: typeof fake) => p.refund({ ...refund, idempotencyKey: "" }),
    ],
    [
      "refund: a key that can't be a header",
      (p: typeof fake) => p.refund({ ...refund, idempotencyKey: "возврат 1" }),
    ],
    [
      "cancel: an empty subscription",
      (p: typeof fake) => p.cancelSubscription({ subscriptionId: "" }),
    ],
    [
      "get: an empty subscription",
      (p: typeof fake) => p.getSubscription({ subscriptionId: "" }),
    ],
    [
      "update: a fractional amount",
      (p: typeof fake) =>
        p.updateSubscription({ subscriptionId: "sc_1", amountKop: 99.5 }),
    ],
    [
      "update: a zero amount",
      (p: typeof fake) =>
        p.updateSubscription({ subscriptionId: "sc_1", amountKop: 0 }),
    ],
    [
      "list: a reversed period",
      (p: typeof fake) => p.listTransactions({ from: day.to, to: day.from }),
    ],
    [
      "list: an empty period",
      (p: typeof fake) => p.listTransactions({ from: day.from, to: day.from }),
    ],
    [
      "list: an invalid date",
      (p: typeof fake) =>
        p.listTransactions({ from: new Date(Number.NaN), to: day.to }),
    ],
  ] as const)("%s", async (_what, call) => {
    const fromAdapter = await errorOf(call(cloudPayments as typeof fake));
    const fromFake = await errorOf(call(fake));
    await fake.settled();

    expect(fromAdapter.code).toBe("INVALID_INPUT");
    expect(fromFake.code).toBe("INVALID_INPUT");
    expect(fromFake.message).toBe(fromAdapter.message);
    expect(received).toEqual([]);
  });
});

describe("httpDeliver: the notification as an HTTP request", () => {
  afterEach(() => vi.unstubAllGlobals());

  const url = "http://localhost:3000/api/webhooks/cloudpayments/pay";

  function stubFetch(answer: Response | Error) {
    const fetchStub = vi.fn((...args: [string, RequestInit]) => {
      void args;
      return answer instanceof Error
        ? Promise.reject(answer)
        : Promise.resolve(answer);
    });
    vi.stubGlobal("fetch", fetchStub);
    return fetchStub;
  }

  it("posts the signed body, untouched, to the endpoint", async () => {
    const webhook = payWebhook({ description: "Корм на октябрь" });
    const fetchStub = stubFetch(Response.json({ code: 0 }));

    const result = await httpDeliver(webhook, url);

    expect(result).toEqual({ status: 200, code: 0 });
    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchStub.mock.calls[0]!;
    expect(calledUrl).toBe(url);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(webhook.body);
    // What arrives passes the adapter: nothing was re-encoded on the way.
    expect(
      adapter.receiveWebhook("pay", {
        rawBody: init.body as string,
        headers: new Headers(init.headers),
      }),
    ).toMatchObject({ type: "pay" });
  });

  it.each([
    ["a refusal", Response.json({ code: 13 }), { status: 200, code: 13 }],
    [
      "an error",
      new Response("oops", { status: 500 }),
      { status: 500, code: null },
    ],
    [
      "no handler",
      new Response("<html>", { status: 404 }),
      { status: 404, code: null },
    ],
    [
      "a code that isn't a number",
      Response.json({ code: "0" }),
      { status: 200, code: null },
    ],
    [
      "an answer that isn't an object",
      Response.json(0),
      { status: 200, code: null },
    ],
    [
      "a network failure",
      new TypeError("fetch failed"),
      { status: null, code: null },
    ],
  ])("reports %s", async (_what, answer, expected) => {
    stubFetch(answer);

    expect(await httpDeliver(payWebhook(), url)).toEqual(expected);
  });

  it("is what the emulator uses unless tests take the delivery over", async () => {
    // A fresh answer per request: a Response body is read once.
    const fetchStub = vi.fn((...args: [string, RequestInit]) => {
      void args;
      return Promise.resolve(Response.json({ code: 0 }));
    });
    vi.stubGlobal("fetch", fetchStub);
    const state = createFakeState();
    const fake = createFakeCloudPayments({ appUrl: APP_URL, state });
    const id = open(fake);

    await fake.pay(id, { outcome: "success", check: true });

    expect(fetchStub.mock.calls.map(([calledUrl]) => calledUrl)).toEqual([
      "http://localhost:3000/api/webhooks/cloudpayments/check",
      "http://localhost:3000/api/webhooks/cloudpayments/pay",
    ]);
    expect(fake.getCheckout(id)).toMatchObject({
      status: "paid",
      deliveries: [{ accepted: true }, { accepted: true }],
    });

    // With a deliverer in the state, nothing reaches the network.
    state.deliver = () => Promise.resolve({ status: 200, code: 0 });
    await fake.pay(open(fake), { outcome: "success", check: true });
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });
});
