import fc from "fast-check";
import { describe, expect, it } from "vitest";
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
import { PaymentProviderError } from "../errors";
import type { PaymentEvent, PaymentIntent } from "../types";
import {
  createFakeCloudPayments,
  createFakeState,
  FAKE_API_SECRET,
  type DeliveryResult,
  type FakeCloudPayments,
} from "./index";
import type { SimulatedWebhook } from "./webhooks";

const APP_URL = "http://localhost:3000";
const NOW = new Date("2026-10-11T09:15:42.123Z");

/**
 * The real CloudPayments adapter with the fake's secret: what the emulator
 * sends must pass the code that will face CloudPayments itself.
 */
const adapter = createCloudPayments({
  publicId: "pk_test",
  apiSecret: FAKE_API_SECRET,
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
  const fake = createFakeCloudPayments({
    appUrl: APP_URL,
    state: createFakeState(),
    now: () => NOW,
    deliver: (webhook) => {
      received.push(webhook);
      const answer = answers[webhook.type] ?? ACCEPT;
      return Promise.resolve(
        typeof answer === "function" ? answer(webhook) : answer,
      );
    },
  });
  return { fake, received };
}

function open(fake: FakeCloudPayments, intent: PaymentIntent = INTENT): string {
  const launch = fake.widgetParams(intent);
  if (launch.kind !== "redirect") throw new Error("expected a redirect");
  return launch.url.split("/").at(-1)!;
}

/** Verifies with the adapter, then parses: the order a handler must keep. */
function receive(webhook: SimulatedWebhook): PaymentEvent {
  expect(adapter.verifyWebhook(incoming(webhook))).toBe(true);
  return adapter.parseWebhook(webhook.type, webhook.body);
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
    });

    expect(adapter.verifyWebhook(incoming(pay))).toBe(true);
    expect(fake.verifyWebhook(incoming(pay))).toBe(true);
    expect(stranger.verifyWebhook(incoming(pay))).toBe(false);
    expect(
      adapter.verifyWebhook(
        incoming(tamper(pay, (body) => body.replace("1500.50", "9500.50"))),
      ),
    ).toBe(false);
    expect(
      adapter.verifyWebhook({ rawBody: pay.body, headers: new Headers() }),
    ).toBe(false);
  });

  it("signs the body, not its fields: another order is another body", () => {
    const pay = payWebhook();
    const reordered = tamper(pay, (body) =>
      body.split("&").reverse().join("&"),
    );

    expect(new URLSearchParams(reordered.body).get("Amount")).toBe("1500.00");
    expect(adapter.verifyWebhook(incoming(pay))).toBe(true);
    expect(adapter.verifyWebhook(incoming(reordered))).toBe(false);
  });

  it("is verified by Content-HMAC; X-Content-HMAC alone is not enough", () => {
    const pay = payWebhook({ description: "Корм на октябрь" });
    const headers = new Headers(pay.headers);

    // The two differ as soon as the body needs URL-encoding.
    expect(headers.get("X-Content-HMAC")).not.toBe(headers.get("Content-HMAC"));
    headers.set("Content-HMAC", headers.get("X-Content-HMAC")!);
    expect(adapter.verifyWebhook({ rawBody: pay.body, headers })).toBe(false);

    headers.delete("Content-HMAC");
    expect(adapter.verifyWebhook({ rawBody: pay.body, headers })).toBe(false);
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
    expect(adapter.verifyWebhook({ rawBody, headers: request.headers })).toBe(
      true,
    );
    expect(adapter.parseWebhook("pay", rawBody)).toMatchObject({
      invoiceId: "invoice-7",
    });
  });

  it("can sign a malformed body, to test what handlers do with it", () => {
    const broken = rawWebhook("pay", "TransactionId=1&Amount=lots");

    expect(adapter.verifyWebhook(incoming(broken))).toBe(true);
    expect(() => adapter.parseWebhook("pay", broken.body)).toThrow(
      "missing or invalid",
    );
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
          expect(adapter.verifyWebhook(incoming(changed))).toBe(false);
        },
      ),
    );
  });
});

describe("the emulated API", () => {
  async function paid(setupResult = setup(), intent: PaymentIntent = INTENT) {
    const { fake, received } = setupResult;
    const id = open(fake, intent);
    await fake.pay(id, { outcome: "success", check: false });
    received.length = 0;
    return { fake, received, checkout: fake.getCheckout(id)! };
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

  it.each([
    ["a fractional amount", { amountKop: 0.5 }],
    ["a zero amount", { amountKop: 0 }],
    ["an empty idempotency key", { idempotencyKey: "" }],
  ])("refuses a refund with %s", async (_what, change) => {
    const { fake, received } = setup();

    const error = await errorOf(
      fake.refund({
        providerTxId: "1",
        amountKop: 100,
        idempotencyKey: "r:1",
        ...change,
      }),
    );
    await fake.settled();

    expect(error.code).toBe("INVALID_INPUT");
    expect(received).toEqual([]);
  });

  const MONTHLY: PaymentIntent = {
    ...INTENT,
    accountId: "donor@shelter.localhost",
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
        status: "CANCELLED",
        amountKop: 150_050,
        nextChargeAt: null,
      },
    });
  });

  it("changes the amount silently and, like CloudPayments, reactivates", async () => {
    const { fake, received, checkout } = await paid(setup(), MONTHLY);
    const subscriptionId = checkout.subscriptionId!;
    await fake.cancelSubscription({ subscriptionId });
    await fake.settled();
    received.length = 0;

    const updated = await fake.updateSubscription({
      subscriptionId,
      amountKop: 30_000,
    });
    await fake.settled();

    expect(updated).toMatchObject({
      id: subscriptionId,
      amountKop: 30_000,
      status: "ACTIVE",
    });
    expect(received).toEqual([]);
  });

  it("refuses to change an unknown subscription or to a bad amount", async () => {
    const { fake, checkout } = await paid(setup(), MONTHLY);

    expect(
      (
        await errorOf(
          fake.updateSubscription({
            subscriptionId: "sc_nope",
            amountKop: 100,
          }),
        )
      ).code,
    ).toBe("REJECTED");
    expect(
      (
        await errorOf(
          fake.updateSubscription({
            subscriptionId: checkout.subscriptionId!,
            amountKop: 99.5,
          }),
        )
      ).code,
    ).toBe("INVALID_INPUT");
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
    const transactions = await fake.listTransactions(day);

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
      await fake.listTransactions({
        from: day.to,
        to: new Date("2026-10-13T00:00:00Z"),
      }),
    ).toEqual([]);
    // [from, to): a transaction at `to` belongs to the next period.
    expect(await fake.listTransactions({ from: day.from, to: NOW })).toEqual(
      [],
    );
  });
});
