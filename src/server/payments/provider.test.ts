import { describe, expect, it } from "vitest";
import { webhookFixtures } from "../../../tests/fixtures/cloudpayments-webhooks";
import { payWebhook, incoming } from "../../../tests/helpers/cloudpayments";
import { createFakeState, isFakeCloudPayments } from "./fake";
import { createPaymentProvider } from "./provider";

const LOCAL = {
  APP_URL: "http://localhost:3000",
  CLOUDPAYMENTS_PUBLIC_ID: undefined,
  CLOUDPAYMENTS_API_SECRET: undefined,
} as const;

const KEYS = {
  CLOUDPAYMENTS_PUBLIC_ID: "pk_test",
  CLOUDPAYMENTS_API_SECRET: "test-api-secret",
};

const INTENT = {
  invoiceId: "invoice-1",
  amountKop: 150_000,
  description: "Пожертвование",
  email: "donor@shelter.localhost",
  metadata: {},
  returnUrl: "http://localhost:3000/donate/status/invoice-1",
};

describe("createPaymentProvider", () => {
  it("gives the fake for PAYMENT_PROVIDER=fake", () => {
    const provider = createPaymentProvider({
      ...LOCAL,
      PAYMENT_PROVIDER: "fake",
    });

    expect(provider.name).toBe("fake");
    expect(isFakeCloudPayments(provider)).toBe(true);
    expect(provider.widgetParams(INTENT).kind).toBe("redirect");
  });

  it("gives CloudPayments for PAYMENT_PROVIDER=cloudpayments", () => {
    const provider = createPaymentProvider({
      ...LOCAL,
      ...KEYS,
      PAYMENT_PROVIDER: "cloudpayments",
    });

    expect(provider.name).toBe("cloudpayments");
    expect(isFakeCloudPayments(provider)).toBe(false);
    expect(provider.widgetParams(INTENT)).toMatchObject({
      kind: "cloudpayments",
      options: { publicTerminalId: "pk_test" },
    });
  });

  it("doesn't fall back to the fake when the CloudPayments keys are missing", () => {
    for (const keys of [
      {},
      { CLOUDPAYMENTS_PUBLIC_ID: "pk_test" },
      { CLOUDPAYMENTS_API_SECRET: "secret" },
      { CLOUDPAYMENTS_PUBLIC_ID: "pk_test", CLOUDPAYMENTS_API_SECRET: "" },
    ]) {
      expect(() =>
        createPaymentProvider({
          ...LOCAL,
          ...keys,
          PAYMENT_PROVIDER: "cloudpayments",
        }),
      ).toThrow("needs CLOUDPAYMENTS_PUBLIC_ID and CLOUDPAYMENTS_API_SECRET");
    }
  });

  it("keeps the fake's secret out of CloudPayments", () => {
    const cloudPayments = createPaymentProvider({
      ...LOCAL,
      ...KEYS,
      PAYMENT_PROVIDER: "cloudpayments",
    });
    // Signed by the fake: valid for the fake only.
    const forged = payWebhook({ amountKop: 1_000_000_00 });

    expect(cloudPayments.verifyWebhook(incoming(forged))).toBe(false);
  });

  it("verifies with the terminal's API Secret", () => {
    const cloudPayments = createPaymentProvider({
      ...LOCAL,
      ...KEYS,
      PAYMENT_PROVIDER: "cloudpayments",
    });
    const { body, contentHmac } = webhookFixtures.pay;

    expect(
      cloudPayments.verifyWebhook({
        rawBody: body,
        headers: new Headers({ "Content-HMAC": contentHmac }),
      }),
    ).toBe(true);
  });

  it("shares the fake's payments through the given state", () => {
    const state = createFakeState();
    const env = { ...LOCAL, PAYMENT_PROVIDER: "fake" } as const;

    const launch = createPaymentProvider(env, state).widgetParams(INTENT);
    const reloaded = createPaymentProvider(env, state);

    expect(launch.kind).toBe("redirect");
    expect(isFakeCloudPayments(reloaded)).toBe(true);
    expect(state.checkouts.size).toBe(1);
  });
});
