import { afterEach, describe, expect, it, vi } from "vitest";
import { getPaymentProvider, WebhookSignatureError } from "@/server/payments";
import { globalFakeState, isFakeCloudPayments } from "@/server/payments/fake";
import {
  incoming,
  interceptFakeWebhooks,
  payWebhook,
  tamper,
  webhookRequest,
} from "../helpers/cloudpayments";

// The payment provider as integration tests get it: FakeCloudPayments
// (.env.example leaves PAYMENT_PROVIDER empty), with its notifications kept
// off the network by the setup.

afterEach(() => {
  vi.unstubAllGlobals();
  // Back to what the setup installed: recorded, delivered nowhere.
  interceptFakeWebhooks();
});

function fakeProvider() {
  const provider = getPaymentProvider();
  if (!isFakeCloudPayments(provider)) throw new Error("expected the fake");
  return provider;
}

describe("the app's payment provider in tests", () => {
  // First, before this file installs anything itself: the setup of every
  // integration test file must have taken the delivery over.
  it("has its notifications off the network from the start", async () => {
    const fetchStub = vi.fn(() => Promise.reject(new Error("no network")));
    vi.stubGlobal("fetch", fetchStub);
    const provider = fakeProvider();

    expect(globalFakeState().deliver).not.toBeNull();
    await provider.refund({
      providerTxId: "3059300326",
      amountKop: 70_000,
      idempotencyKey: "refund:donation-0:1",
    });
    await provider.settled();

    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("is the emulator and accepts what the simulator signs", () => {
    const provider = fakeProvider();
    const pay = payWebhook({ invoiceId: "donation-1", amountKop: 150_000 });

    expect(provider.name).toBe("fake");
    expect(provider.receiveWebhook("pay", incoming(pay))).toMatchObject({
      type: "pay",
      invoiceId: "donation-1",
      amountKop: 150_000,
      dedupeKey: expect.stringMatching(/^cp:pay:\d+$/) as string,
    });
    expect(() =>
      provider.receiveWebhook(
        "pay",
        incoming(tamper(pay, (body) => body.replace("1500.00", "9500.00"))),
      ),
    ).toThrow(WebhookSignatureError);
  });

  it("sends nothing to the network unless a test routes it", async () => {
    const fetchStub = vi.fn(() => Promise.reject(new Error("no network")));
    vi.stubGlobal("fetch", fetchStub);
    const provider = fakeProvider();
    const sent = interceptFakeWebhooks();

    await provider.refund({
      providerTxId: "3059300327",
      amountKop: 70_000,
      idempotencyKey: "refund:donation-1:1",
    });
    await provider.settled();

    expect(fetchStub).not.toHaveBeenCalled();
    expect(sent.map((webhook) => webhook.type)).toEqual(["refund"]);
  });

  it("hands notifications to the handler a test gives", async () => {
    const provider = fakeProvider();
    // Stands in for the route handler of /api/webhooks/cloudpayments/[type].
    const handled: string[] = [];
    const sent = interceptFakeWebhooks(async (webhook) => {
      const request = webhookRequest(webhook);
      const event = provider.receiveWebhook(webhook.type, {
        rawBody: await request.text(),
        headers: request.headers,
      });
      handled.push(event.dedupeKey);
      return provider.webhookResponse("ok");
    });

    const { refundTxId } = await provider.refund({
      providerTxId: "3059300328",
      amountKop: 70_000,
      idempotencyKey: "refund:donation-2:1",
    });
    await provider.settled();

    expect(sent).toHaveLength(1);
    expect(handled).toEqual([`cp:refund:${refundTxId}`]);
  });

  it("shows a test what its handler threw", async () => {
    const provider = fakeProvider();
    interceptFakeWebhooks(() => {
      throw new Error("handler exploded");
    });

    await provider.refund({
      providerTxId: "3059300329",
      amountKop: 70_000,
      idempotencyKey: "refund:donation-4:1",
    });

    await expect(provider.settled()).rejects.toThrow("handler exploded");
  });

  it("goes through a whole checkout against a handler", async () => {
    const provider = fakeProvider();
    const replies: string[] = [];
    interceptFakeWebhooks((webhook) => {
      replies.push(webhook.type);
      // A handler that knows the invoice but fails on the Pay.
      return provider.webhookResponse(webhook.type === "pay" ? "retry" : "ok");
    });
    const launch = provider.widgetParams({
      invoiceId: "donation-3",
      amountKop: 50_000,
      description: "Пожертвование",
      email: "donor@shelter.localhost",
      metadata: { target: "GENERAL" },
      returnUrl: "http://localhost:3000/donate/status/donation-3",
    });
    if (launch.kind !== "redirect") throw new Error("expected a redirect");
    const checkoutId = launch.url.split("/").at(-1)!;

    await provider.pay(checkoutId, { outcome: "success", check: true });

    expect(replies).toEqual(["check", "pay"]);
    expect(provider.getCheckout(checkoutId)).toMatchObject({
      status: "paid",
      deliveries: [
        { accepted: true, status: 200, code: 0 },
        { accepted: false, status: 500, code: null },
      ],
    });
  });
});
