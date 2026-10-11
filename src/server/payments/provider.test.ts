import { describe, expect, it } from "vitest";
import { webhookFixtures } from "../../../tests/fixtures/cloudpayments-webhooks";
import { payWebhook, incoming } from "../../../tests/helpers/cloudpayments";
import { WebhookSignatureError } from "./errors";
import { createFakeState, globalFakeState, isFakeCloudPayments } from "./fake";
import { createPaymentProvider } from "./provider";

const LOCAL = {
  APP_URL: "http://localhost:3000",
  CLOUDPAYMENTS_PUBLIC_ID: undefined,
  CLOUDPAYMENTS_API_SECRET: undefined,
  CLOUDPAYMENTS_ACCEPT_TEST_PAYMENTS: false,
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

  it("refuses the fake on a public APP_URL, even past the env check", () => {
    for (const APP_URL of [
      "https://priyut.example",
      "http://192.168.1.10:3000",
    ]) {
      expect(() =>
        createPaymentProvider({ ...LOCAL, APP_URL, PAYMENT_PROVIDER: "fake" }),
      ).toThrow("allowed only with a local APP_URL");
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

    expect(() => cloudPayments.receiveWebhook("pay", incoming(forged))).toThrow(
      WebhookSignatureError,
    );
  });

  it("verifies with the terminal's API Secret", () => {
    const staging = createPaymentProvider({
      ...LOCAL,
      ...KEYS,
      PAYMENT_PROVIDER: "cloudpayments",
      CLOUDPAYMENTS_ACCEPT_TEST_PAYMENTS: true,
    });
    const { body, contentHmac } = webhookFixtures.pay;

    expect(
      staging.receiveWebhook("pay", {
        rawBody: body,
        headers: new Headers({ "Content-HMAC": contentHmac }),
      }),
    ).toMatchObject({ type: "pay", amountKop: 150_000, testMode: true });
  });

  it("takes test payments only where CLOUDPAYMENTS_ACCEPT_TEST_PAYMENTS says so", () => {
    const production = createPaymentProvider({
      ...LOCAL,
      ...KEYS,
      PAYMENT_PROVIDER: "cloudpayments",
    });
    const { body, contentHmac } = webhookFixtures.pay;
    const fake = createPaymentProvider({ ...LOCAL, PAYMENT_PROVIDER: "fake" });

    expect(production.acceptsTestPayments).toBe(false);
    expect(fake.acceptsTestPayments).toBe(true);
    // Correctly signed by the terminal — and still not money.
    expect(() =>
      production.receiveWebhook("pay", {
        rawBody: body,
        headers: new Headers({ "Content-HMAC": contentHmac }),
      }),
    ).toThrow("test payments are not accepted here");
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

  it("uses the process-wide emulated terminal unless given another", () => {
    const env = { ...LOCAL, PAYMENT_PROVIDER: "fake" } as const;
    const before = globalFakeState().checkouts.size;

    createPaymentProvider(env).widgetParams(INTENT);
    createPaymentProvider(env).widgetParams(INTENT);

    expect(globalFakeState().checkouts.size).toBe(before + 2);
  });
});
