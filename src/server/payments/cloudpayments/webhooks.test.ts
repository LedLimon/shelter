import { describe, expect, it } from "vitest";
import { webhookFixtures } from "../../../../tests/fixtures/cloudpayments-webhooks";
import { WebhookParseError } from "../errors";
import { parseUtcDateTime, parseWebhook } from "./webhooks";

/** A fixture body with some fields replaced (or, with null, removed). */
function edit(body: string, changes: Record<string, string | null>): string {
  const params = new URLSearchParams(body);
  for (const [name, value] of Object.entries(changes)) {
    if (value === null) params.delete(name);
    else params.set(name, value);
  }
  return params.toString();
}

function errorOf(type: string, body: string): WebhookParseError {
  try {
    parseWebhook(type, body);
  } catch (error) {
    if (error instanceof WebhookParseError) return error;
    throw error;
  }
  throw new Error("expected WebhookParseError");
}

const NEED_METADATA = { target: "NEED", needId: "need_korm_oct" };

describe("parseWebhook: fixtures of every notification type", () => {
  it("check", () => {
    expect(parseWebhook("check", webhookFixtures.check.body)).toEqual({
      type: "check",
      operation: "payment",
      dedupeKey: "cp:check:3059300327",
      providerTxId: "3059300327",
      invoiceId: "cm2donation0000000000001",
      amountKop: 150_000,
      occurredAt: new Date("2026-10-11T09:15:42Z"),
      testMode: true,
      accountId: "donor@shelter.localhost",
      email: "donor@shelter.localhost",
      subscriptionId: null,
      method: null,
      metadata: NEED_METADATA,
    });
  });

  it("pay", () => {
    expect(parseWebhook("pay", webhookFixtures.pay.body)).toEqual({
      type: "pay",
      dedupeKey: "cp:pay:3059300327",
      providerTxId: "3059300327",
      invoiceId: "cm2donation0000000000001",
      amountKop: 150_000,
      occurredAt: new Date("2026-10-11T09:15:42Z"),
      testMode: true,
      accountId: "donor@shelter.localhost",
      email: "donor@shelter.localhost",
      subscriptionId: null,
      method: null,
      metadata: NEED_METADATA,
    });
  });

  it("pay by SBP: no card, kopecks, a live terminal", () => {
    expect(parseWebhook("pay", webhookFixtures.paySbp.body)).toEqual({
      type: "pay",
      dedupeKey: "cp:pay:3059300911",
      providerTxId: "3059300911",
      invoiceId: "cm2donation0000000000002",
      amountKop: 25_050,
      occurredAt: new Date("2026-10-11T21:03:07Z"),
      testMode: false,
      accountId: null,
      email: "anna@example.org",
      subscriptionId: null,
      method: "Sbp",
      metadata: { target: "GENERAL" },
    });
  });

  it("pay of a subscription: no invoice of ours", () => {
    expect(parseWebhook("pay", webhookFixtures.payRecurring.body)).toEqual({
      type: "pay",
      dedupeKey: "cp:pay:3071188402",
      providerTxId: "3071188402",
      invoiceId: null,
      amountKop: 50_000,
      occurredAt: new Date("2026-11-11T06:00:13Z"),
      testMode: true,
      accountId: "donor@shelter.localhost",
      email: "donor@shelter.localhost",
      subscriptionId: "sc_8cf8a9338fb8ebf7202b08d09c938",
      method: null,
      metadata: null,
    });
  });

  it("fail", () => {
    expect(parseWebhook("fail", webhookFixtures.fail.body)).toEqual({
      type: "fail",
      operation: "payment",
      reasonCode: 5051,
      reason: "InsufficientFunds",
      dedupeKey: "cp:fail:3059300455",
      providerTxId: "3059300455",
      invoiceId: "cm2donation0000000000003",
      amountKop: 150_000,
      occurredAt: new Date("2026-10-11T09:21:05Z"),
      testMode: true,
      accountId: "donor@shelter.localhost",
      email: "donor@shelter.localhost",
      subscriptionId: null,
      method: null,
      metadata: NEED_METADATA,
    });
  });

  it("refund", () => {
    expect(parseWebhook("refund", webhookFixtures.refund.body)).toEqual({
      type: "refund",
      dedupeKey: "cp:refund:3059411876",
      refundTxId: "3059411876",
      paymentTxId: "3059300327",
      amountKop: 70_000,
      occurredAt: new Date("2026-10-12T14:02:55Z"),
      invoiceId: "cm2donation0000000000001",
      accountId: "donor@shelter.localhost",
      email: "donor@shelter.localhost",
      metadata: NEED_METADATA,
    });
  });

  it("recurrent", () => {
    const event = parseWebhook("recurrent", webhookFixtures.recurrent.body);

    expect(event).toEqual({
      type: "recurrent",
      dedupeKey: expect.stringMatching(
        /^cp:recurrent:sc_8cf8a9338fb8ebf7202b08d09c938:[0-9a-f]{32}$/,
      ) as string,
      subscription: {
        id: "sc_8cf8a9338fb8ebf7202b08d09c938",
        accountId: "donor@shelter.localhost",
        email: "donor@shelter.localhost",
        amountKop: 50_000,
        status: "PAST_DUE",
        interval: "MONTH",
        period: 1,
        startAt: new Date("2026-11-11T06:00:00Z"),
        lastChargeAt: new Date("2027-01-11T06:00:21Z"),
        nextChargeAt: new Date("2027-01-12T06:00:00Z"),
        successfulCharges: 3,
        failedCharges: 1,
      },
    });
  });
});

describe("parseWebhook: dedupe keys", () => {
  it("are the same for a retry and differ between transactions", () => {
    const { body } = webhookFixtures.pay;
    const other = edit(body, { TransactionId: "3059300328" });

    expect(parseWebhook("pay", body).dedupeKey).toBe(
      parseWebhook("pay", body).dedupeKey,
    );
    expect(parseWebhook("pay", other).dedupeKey).toBe("cp:pay:3059300328");
  });

  it("tell a pay, a fail and a check of one transaction apart", () => {
    const keys = [
      parseWebhook("check", webhookFixtures.check.body).dedupeKey,
      parseWebhook("pay", webhookFixtures.pay.body).dedupeKey,
      parseWebhook(
        "fail",
        edit(webhookFixtures.fail.body, { TransactionId: "3059300327" }),
      ).dedupeKey,
    ];

    expect(new Set(keys).size).toBe(3);
  });

  it("tell two status changes of one subscription apart", () => {
    const { body } = webhookFixtures.recurrent;
    const retry = parseWebhook("recurrent", body);
    const rejected = parseWebhook(
      "recurrent",
      edit(body, { Status: "Rejected", FailedTransactionsNumber: "3" }),
    );
    // PastDue again a month later: the same status, other counters.
    const again = parseWebhook(
      "recurrent",
      edit(body, { SuccessfulTransactionsNumber: "4" }),
    );

    expect(parseWebhook("recurrent", body).dedupeKey).toBe(retry.dedupeKey);
    expect(rejected.dedupeKey).not.toBe(retry.dedupeKey);
    expect(again.dedupeKey).not.toBe(retry.dedupeKey);
  });
});

describe("parseWebhook: amounts", () => {
  it.each([
    ["1500", 150_000],
    ["1500.5", 150_050],
    ["1500.50", 150_050],
    ["0.01", 1],
    ["21474836.47", 2_147_483_647],
  ])("reads Amount=%s as %i kopecks", (Amount, amountKop) => {
    const event = parseWebhook(
      "pay",
      edit(webhookFixtures.pay.body, { Amount }),
    );

    expect(event).toMatchObject({ amountKop });
  });

  it.each([
    "0",
    "0.00",
    "-1500.00",
    "1500,00",
    "1 500.00",
    "1500.005",
    "1.5e3",
    "21474836.48",
    "abc",
  ])("refuses Amount=%s instead of guessing", (Amount) => {
    for (const type of ["check", "pay", "fail", "refund"] as const) {
      const error = errorOf(type, edit(webhookFixtures[type].body, { Amount }));

      expect(error.code).toBe("MALFORMED");
      expect(error.message).toBe(
        `payments: ${type} notification: missing or invalid Amount`,
      );
    }
  });
});

describe("parseWebhook: what we don't accept", () => {
  it("another currency: its amount is not rubles", () => {
    for (const type of ["check", "pay", "fail", "recurrent"] as const) {
      const error = errorOf(
        type,
        edit(webhookFixtures[type].body, { Currency: "USD" }),
      );

      expect(error.code).toBe("UNSUPPORTED");
      expect(error.message).toContain("Currency is not RUB");
    }
  });

  it("a two-stage payment: held money is not received money", () => {
    for (const type of ["check", "pay"] as const) {
      const error = errorOf(
        type,
        edit(webhookFixtures[type].body, { Status: "Authorized" }),
      );

      expect(error.code).toBe("UNSUPPORTED");
      expect(error.message).toContain("two-stage payments");
    }
  });

  it("a card payout", () => {
    for (const type of ["check", "pay", "fail", "refund"] as const) {
      const error = errorOf(
        type,
        edit(webhookFixtures[type].body, { OperationType: "CardPayout" }),
      );

      expect(error.code).toBe("UNSUPPORTED");
    }
  });

  it("a pay that isn't a payment, a refund that isn't a refund", () => {
    expect(
      errorOf(
        "pay",
        edit(webhookFixtures.pay.body, { OperationType: "Refund" }),
      ).message,
    ).toContain("OperationType is not Payment");
    expect(
      errorOf(
        "refund",
        edit(webhookFixtures.refund.body, { OperationType: "Payment" }),
      ).message,
    ).toContain("OperationType is not Refund");
  });

  it("an unknown notification type", () => {
    for (const type of ["confirm", "cancel", "Pay", "", "__proto__"]) {
      expect(errorOf(type, webhookFixtures.pay.body).code).toBe("UNKNOWN_TYPE");
    }
  });
});

describe("parseWebhook: a failed refund is not a failed payment", () => {
  it("keeps the operation of a fail and of a check", () => {
    const fail = parseWebhook(
      "fail",
      edit(webhookFixtures.fail.body, { OperationType: "Refund" }),
    );
    const check = parseWebhook(
      "check",
      edit(webhookFixtures.check.body, { OperationType: "Refund" }),
    );

    expect(fail).toMatchObject({ type: "fail", operation: "refund" });
    expect(check).toMatchObject({ type: "check", operation: "refund" });
  });
});

describe("parseWebhook: malformed bodies", () => {
  it.each([
    [
      "check",
      [
        "TransactionId",
        "Amount",
        "Currency",
        "DateTime",
        "TestMode",
        "Status",
        "OperationType",
      ],
    ],
    [
      "pay",
      [
        "TransactionId",
        "Amount",
        "Currency",
        "DateTime",
        "TestMode",
        "Status",
        "OperationType",
      ],
    ],
    [
      "fail",
      [
        "TransactionId",
        "Amount",
        "Currency",
        "DateTime",
        "TestMode",
        "OperationType",
        "Reason",
        "ReasonCode",
      ],
    ],
    [
      "refund",
      [
        "TransactionId",
        "PaymentTransactionId",
        "Amount",
        "DateTime",
        "OperationType",
      ],
    ],
    [
      "recurrent",
      [
        "Id",
        "AccountId",
        "Amount",
        "Currency",
        "StartDate",
        "Interval",
        "Period",
        "Status",
        "SuccessfulTransactionsNumber",
        "FailedTransactionsNumber",
      ],
    ],
  ] as const)("%s needs its required fields", (type, required) => {
    for (const field of required) {
      for (const value of [null, ""]) {
        const error = errorOf(
          type,
          edit(webhookFixtures[type].body, { [field]: value }),
        );

        expect(error.code).toBe("MALFORMED");
        expect(error.message).toBe(
          `payments: ${type} notification: missing or invalid ${field}`,
        );
      }
    }
  });

  it("lists every bad field at once", () => {
    const error = errorOf(
      "pay",
      edit(webhookFixtures.pay.body, {
        TransactionId: "tx-1",
        Amount: "many",
        DateTime: "yesterday",
        TestMode: "maybe",
      }),
    );

    expect(error.message).toBe(
      "payments: pay notification: missing or invalid TransactionId, Amount, DateTime, TestMode",
    );
  });

  it.each([
    ["TransactionId", "12a"],
    ["TransactionId", "-5"],
    ["TransactionId", "1.5"],
    ["TransactionId", "12345678901234567890"],
    ["DateTime", "2026-10-11"],
    ["DateTime", "11.10.2026 09:15:42"],
    ["DateTime", "2026-02-30 09:15:42"],
    ["DateTime", "2026-10-11 24:00:00"],
    ["DateTime", "2026-10-11 09:15:42 +03:00"],
    ["TestMode", "2"],
    ["Status", "Declined"],
    ["OperationType", "Something"],
  ])("refuses %s=%s", (field, value) => {
    const error = errorOf(
      "pay",
      edit(webhookFixtures.pay.body, { [field]: value }),
    );

    expect(error.code).toBe("MALFORMED");
    expect(error.message).toContain(field);
  });

  it("refuses a repeated field rather than picking one", () => {
    const error = errorOf("pay", `${webhookFixtures.pay.body}&Amount=1.00`);

    expect(error.code).toBe("MALFORMED");
    expect(error.message).toContain("Amount");
  });

  it.each(["", "{}", '{"TransactionId":1,"Amount":10}', "not a form"])(
    "refuses the body %j",
    (body) => {
      expect(errorOf("pay", body).code).toBe("MALFORMED");
    },
  );

  it("never quotes values: bodies carry emails", () => {
    const error = errorOf(
      "pay",
      edit(webhookFixtures.pay.body, {
        Amount: "donor@shelter.localhost",
        Currency: "donor@shelter.localhost",
      }),
    );

    expect(error.message).not.toContain("donor");
    expect(error.message).not.toContain("@");
  });
});

describe("parseWebhook: optional fields", () => {
  it("reads TestMode in either spelling", () => {
    for (const [TestMode, testMode] of [
      ["1", true],
      ["0", false],
      ["True", true],
      ["false", false],
    ] as const) {
      expect(
        parseWebhook("pay", edit(webhookFixtures.pay.body, { TestMode })),
      ).toMatchObject({ testMode });
    }
  });

  it("gives null metadata when Data is absent or isn't JSON", () => {
    for (const Data of [null, "", "{not json", "target=NEED"]) {
      expect(
        parseWebhook("pay", edit(webhookFixtures.pay.body, { Data })),
      ).toMatchObject({ metadata: null });
    }
  });

  it("ignores fields it doesn't use, whatever is in them", () => {
    const event = parseWebhook(
      "pay",
      edit(webhookFixtures.pay.body, {
        TotalFee: "not a number",
        CardExpDate: "??",
        PaymentAmount: "",
        SomethingNew: "from a future version",
      }),
    );

    expect(event).toMatchObject({ type: "pay", amountKop: 150_000 });
  });

  it("reads a subscription without optional dates and email", () => {
    const event = parseWebhook(
      "recurrent",
      edit(webhookFixtures.recurrent.body, {
        Status: "Cancelled",
        Interval: "Week",
        Email: "",
        LastTransactionDate: null,
        NextTransactionDate: "",
      }),
    );

    expect(event).toMatchObject({
      subscription: {
        status: "CANCELLED",
        interval: "WEEK",
        email: null,
        lastChargeAt: null,
        nextChargeAt: null,
      },
    });
  });

  it.each(["Active", "PastDue", "Cancelled", "Rejected", "Expired"])(
    "knows the subscription status %s",
    (Status) => {
      const event = parseWebhook(
        "recurrent",
        edit(webhookFixtures.recurrent.body, { Status }),
      );

      expect(event).toMatchObject({
        subscription: {
          status: Status.replace(/(?<=[a-z])(?=[A-Z])/, "_").toUpperCase(),
        },
      });
    },
  );
});

describe("parseUtcDateTime", () => {
  it.each([
    ["2026-10-11 09:15:42", "2026-10-11T09:15:42.000Z"],
    ["2026-10-11T09:15:42", "2026-10-11T09:15:42.000Z"],
    ["2026-10-11T09:15:42Z", "2026-10-11T09:15:42.000Z"],
    ["2026-10-11T09:15:42.537", "2026-10-11T09:15:42.000Z"],
    ["2024-02-29 23:59:59", "2024-02-29T23:59:59.000Z"],
  ])("reads %s as UTC", (value, expected) => {
    expect(parseUtcDateTime(value)?.toISOString()).toBe(expected);
  });

  it.each([
    "",
    "2026-10-11",
    "2026-13-01 00:00:00",
    "2026-02-29 00:00:00",
    "2026-10-11 09:60:00",
    "2026-10-11 09:15:42+03:00",
    "/Date(1615288374632)/",
  ])("refuses %j", (value) => {
    expect(parseUtcDateTime(value)).toBeNull();
  });
});
