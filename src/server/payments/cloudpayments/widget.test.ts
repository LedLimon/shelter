import { describe, expect, it } from "vitest";
import { PaymentProviderError } from "../errors";
import type { PaymentIntent } from "../types";
import { cloudPaymentsWidgetParams, WIDGET_SCRIPT_URL } from "./widget";

const INTENT: PaymentIntent = {
  invoiceId: "cm2donation0000000000001",
  amountKop: 150_050,
  description: "Пожертвование: корм на октябрь",
  email: "donor@shelter.localhost",
  metadata: { target: "NEED", needId: "need_korm_oct" },
  returnUrl: "https://priyut.example/donate/status/cm2donation0000000000001",
};

function errorOf(intent: PaymentIntent): PaymentProviderError {
  try {
    cloudPaymentsWidgetParams("pk_test", intent);
  } catch (error) {
    if (error instanceof PaymentProviderError) return error;
    throw error;
  }
  throw new Error("expected PaymentProviderError");
}

describe("cloudPaymentsWidgetParams", () => {
  it("builds the options of widget.start() for a one-time payment", () => {
    expect(cloudPaymentsWidgetParams("pk_test", INTENT)).toEqual({
      kind: "cloudpayments",
      scriptUrl: WIDGET_SCRIPT_URL,
      options: {
        publicTerminalId: "pk_test",
        amount: 1500.5,
        currency: "RUB",
        paymentSchema: "Single",
        culture: "ru-RU",
        description: "Пожертвование: корм на октябрь",
        externalId: "cm2donation0000000000001",
        userInfo: { email: "donor@shelter.localhost" },
        metadata: { target: "NEED", needId: "need_korm_oct" },
        successRedirectUrl: INTENT.returnUrl,
        failRedirectUrl: INTENT.returnUrl,
      },
    });
  });

  it("adds the subscription and the payer's id for a monthly one", () => {
    const params = cloudPaymentsWidgetParams("pk_test", {
      ...INTENT,
      accountId: "donor@shelter.localhost",
      recurrent: { interval: "MONTH", period: 1 },
    });

    expect(params).toMatchObject({
      options: {
        userInfo: {
          email: "donor@shelter.localhost",
          accountId: "donor@shelter.localhost",
        },
        recurrent: { interval: "Month", period: 1 },
      },
    });
  });

  it("passes another amount for the following charges", () => {
    const params = cloudPaymentsWidgetParams("pk_test", {
      ...INTENT,
      accountId: "donor-1",
      recurrent: { interval: "MONTH", period: 1, amountKop: 50_000 },
    });

    expect(params).toMatchObject({
      options: { recurrent: { interval: "Month", period: 1, amount: 500 } },
    });
  });

  it.each([
    [1, 0.01],
    [10, 0.1],
    [100, 1],
    [29_999, 299.99],
    [2_147_483_647, 21_474_836.47],
  ])("sends %i kopecks as %d rubles", (amountKop, amount) => {
    const params = cloudPaymentsWidgetParams("pk_test", {
      ...INTENT,
      amountKop,
    });

    expect(params).toMatchObject({ options: { amount } });
  });

  it.each([
    ["a fractional amount", { amountKop: 1500.5 }, "amountKop"],
    ["a zero amount", { amountKop: 0 }, "amountKop"],
    ["a negative amount", { amountKop: -1 }, "amountKop"],
    ["an amount over Int", { amountKop: 2_147_483_648 }, "amountKop"],
    ["NaN", { amountKop: Number.NaN }, "amountKop"],
    ["an empty invoice", { invoiceId: " " }, "invoiceId"],
    ["an empty description", { description: "" }, "description"],
    ["a broken email", { email: "donor" }, "email"],
    ["a relative return URL", { returnUrl: "/donate/status/1" }, "returnUrl"],
    [
      "a javascript: return URL",
      { returnUrl: "javascript:alert(1)" },
      "returnUrl",
    ],
    [
      "a subscription without the payer's id",
      { recurrent: { interval: "MONTH", period: 1 } },
      "accountId",
    ],
    [
      "a subscription with a zero period",
      { accountId: "donor-1", recurrent: { interval: "MONTH", period: 0 } },
      "recurrent.period",
    ],
    [
      "a fractional subscription amount",
      {
        accountId: "donor-1",
        recurrent: { interval: "MONTH", period: 1, amountKop: 99.9 },
      },
      "recurrent.amountKop",
    ],
  ] as const)("refuses %s", (_what, change, field) => {
    const error = errorOf({ ...INTENT, ...change });

    expect(error.code).toBe("INVALID_INPUT");
    expect(error.message).toBe(`payments: invalid payment intent: ${field}`);
  });

  it("never quotes the intent in the error: it carries an email", () => {
    const error = errorOf({ ...INTENT, amountKop: 0, email: "donor@" });

    expect(error.message).not.toContain("donor");
  });
});
