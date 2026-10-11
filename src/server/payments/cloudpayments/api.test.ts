import { describe, expect, it, vi } from "vitest";
import { PaymentProviderError } from "../errors";
import { API_URL, createCloudPaymentsApi } from "./api";

const CREDENTIALS = {
  publicId: "pk_test_public",
  apiSecret: "test-api-secret",
  // As on staging: the docs' example transactions are test ones.
  acceptTestPayments: true,
};

type Call = { url: string; headers: Headers; body: unknown };

/** An API whose fetch answers from a queue and records what it was asked. */
function apiWith(...answers: Array<Response | Error>) {
  const calls: Call[] = [];
  const fetchStub = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- always a string here
      url: String(url),
      headers: new Headers(init?.headers),
      body: JSON.parse(init?.body as string) as unknown,
    });
    const answer = answers.shift();
    if (!answer) throw new Error("unexpected request");
    return answer instanceof Error
      ? Promise.reject(answer)
      : Promise.resolve(answer);
  });
  const api = createCloudPaymentsApi({ ...CREDENTIALS, fetch: fetchStub });
  return { api, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const ok = (Model?: unknown) => json({ Model, Success: true, Message: null });

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

const REFUND = {
  providerTxId: "3059300327",
  amountKop: 70_050,
  idempotencyKey: "refund:donation-1:1",
};

describe("requests", () => {
  it("authenticate with HTTP Basic: Public ID and API Secret", async () => {
    const { api, calls } = apiWith(ok({ TransactionId: 568 }));

    await api.refund(REFUND);

    // base64("pk_test_public:test-api-secret"), computed with `base64`.
    expect(calls[0]!.headers.get("Authorization")).toBe(
      "Basic cGtfdGVzdF9wdWJsaWM6dGVzdC1hcGktc2VjcmV0",
    );
    expect(calls[0]!.headers.get("Content-Type")).toBe("application/json");
  });

  it("refuse to start without credentials", () => {
    expect(() =>
      createCloudPaymentsApi({ ...CREDENTIALS, apiSecret: "" }),
    ).toThrow("credentials are empty");
    expect(() =>
      createCloudPaymentsApi({ ...CREDENTIALS, publicId: "" }),
    ).toThrow("credentials are empty");
  });
});

describe("refund", () => {
  it("posts the transaction and the amount in rubles", async () => {
    const { api, calls } = apiWith(ok({ TransactionId: 568 }));

    await expect(api.refund(REFUND)).resolves.toEqual({ refundTxId: "568" });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${API_URL}/payments/refund`);
    expect(calls[0]!.body).toEqual({
      TransactionId: 3059300327,
      Amount: 700.5,
    });
  });

  it("sends the idempotency key as X-Request-ID, the same on every repeat", async () => {
    const { api, calls } = apiWith(
      ok({ TransactionId: 568 }),
      ok({ TransactionId: 568 }),
      ok({ TransactionId: 569 }),
    );

    await api.refund(REFUND);
    await api.refund(REFUND);
    await api.refund({ ...REFUND, idempotencyKey: "refund:donation-1:2" });

    expect(calls.map((call) => call.headers.get("X-Request-ID"))).toEqual([
      "refund:donation-1:1",
      "refund:donation-1:1",
      "refund:donation-1:2",
    ]);
  });

  it.each([
    ["a fractional amount", { amountKop: 700.5 }],
    ["a zero amount", { amountKop: 0 }],
    ["a negative amount", { amountKop: -100 }],
    ["an amount over Int", { amountKop: 2_147_483_648 }],
    ["NaN", { amountKop: Number.NaN }],
    ["a non-numeric transaction", { providerTxId: "tx-1" }],
    ["an empty transaction", { providerTxId: "" }],
    [
      "a transaction id too long for a number",
      { providerTxId: "1234567890123456" },
    ],
    ["an empty idempotency key", { idempotencyKey: "" }],
    [
      "an idempotency key that can't be a header",
      { idempotencyKey: "возврат 1" },
    ],
    [
      "an idempotency key with a line break",
      { idempotencyKey: "refund:1\r\nX-Evil: 1" },
    ],
  ])("sends nothing for %s", async (_what, change) => {
    const { api, calls } = apiWith();

    const error = await errorOf(api.refund({ ...REFUND, ...change }));

    expect(error.code).toBe("INVALID_INPUT");
    expect(error.outcome).toBe("not-performed");
    expect(calls).toHaveLength(0);
  });

  it("reports a refusal with the provider's explanation", async () => {
    const { api } = apiWith(
      json({ Success: false, Message: "Transaction not found" }),
    );

    const error = await errorOf(api.refund(REFUND));

    expect(error.code).toBe("REJECTED");
    expect(error.providerMessage).toBe("Transaction not found");
    expect(error.outcome).toBe("not-performed");
  });

  it.each([
    ["a network error", new TypeError("fetch failed"), "UNAVAILABLE"],
    ["a timeout", new DOMException("timed out", "TimeoutError"), "UNAVAILABLE"],
    ["HTTP 502", new Response("Bad Gateway", { status: 502 }), "UNAVAILABLE"],
    ["an answer that isn't JSON", new Response("<html>"), "BAD_RESPONSE"],
    ["an answer without Success", json({ Model: {} }), "BAD_RESPONSE"],
    ["a success without the refund's id", ok({}), "BAD_RESPONSE"],
    ["HTTP 404", json({ Success: true }, 404), "BAD_RESPONSE"],
  ] as const)(
    "doesn't know the outcome after %s",
    async (_what, answer, code) => {
      const { api } = apiWith(answer);

      const error = await errorOf(api.refund(REFUND));

      expect(error.code).toBe(code);
      // The refund may have happened: never to be recorded as failed.
      expect(error.outcome).toBe("unknown");
    },
  );

  it.each([
    [401, "UNAUTHORIZED"],
    [429, "RATE_LIMITED"],
  ] as const)("knows nothing was done on HTTP %i", async (status, code) => {
    const { api } = apiWith(new Response("", { status }));

    const error = await errorOf(api.refund(REFUND));

    expect(error.code).toBe(code);
    expect(error.outcome).toBe("not-performed");
  });

  it("keeps credentials and request data out of error messages", async () => {
    for (const answer of [
      new TypeError(`fetch failed: ${CREDENTIALS.apiSecret}`),
      new Response("", { status: 401 }),
      json({ Success: false, Message: "no" }),
    ]) {
      const { api } = apiWith(answer);

      const error = await errorOf(api.refund(REFUND));

      expect(error.message).not.toContain(CREDENTIALS.apiSecret);
      expect(error.message).not.toContain(CREDENTIALS.publicId);
      expect(error.message).not.toContain(REFUND.providerTxId);
      expect(error.cause).toBeUndefined();
    }
  });
});

const SUBSCRIPTION_MODEL = {
  Id: "sc_3ffc96c001e152b341817341b075a",
  AccountId: "donor@shelter.localhost",
  Description: "Ежемесячное пожертвование",
  Email: "donor@shelter.localhost",
  Amount: 499.5,
  CurrencyCode: 0,
  Currency: "RUB",
  RequireConfirmation: false,
  StartDate: "/Date(1635973200000)/",
  StartDateIso: "2021-11-03T21:00:00",
  IntervalCode: 1,
  Interval: "Month",
  Period: 1,
  MaxPeriods: null,
  CultureName: "ru-RU",
  StatusCode: 0,
  Status: "Active",
  SuccessfulTransactionsNumber: 2,
  FailedTransactionsNumber: 0,
  LastTransactionDate: null,
  LastTransactionDateIso: null,
  NextTransactionDate: "/Date(1638565200000)/",
  NextTransactionDateIso: "2021-12-03T21:00:00",
  Receipt: null,
  FailoverSchemeId: null,
};

describe("subscriptions", () => {
  it("cancels by id", async () => {
    const { api, calls } = apiWith(json({ Success: true, Message: null }));

    await expect(
      api.cancelSubscription({
        subscriptionId: "sc_cc673fdc50b3577e60eee9081e440",
      }),
    ).resolves.toBeUndefined();

    expect(calls[0]!.url).toBe(`${API_URL}/subscriptions/cancel`);
    expect(calls[0]!.body).toEqual({ Id: "sc_cc673fdc50b3577e60eee9081e440" });
  });

  it("doesn't take a refused cancellation for a cancelled subscription", async () => {
    const { api } = apiWith(json({ Success: false, Message: "Not found" }));

    const error = await errorOf(
      api.cancelSubscription({ subscriptionId: "sc_unknown" }),
    );

    expect(error.code).toBe("REJECTED");
  });

  it("reads a subscription", async () => {
    const { api, calls } = apiWith(ok(SUBSCRIPTION_MODEL));

    const subscription = await api.getSubscription({
      subscriptionId: SUBSCRIPTION_MODEL.Id,
    });

    expect(calls[0]!.url).toBe(`${API_URL}/subscriptions/get`);
    expect(calls[0]!.body).toEqual({ Id: SUBSCRIPTION_MODEL.Id });
    expect(subscription).toEqual({
      id: SUBSCRIPTION_MODEL.Id,
      accountId: "donor@shelter.localhost",
      email: "donor@shelter.localhost",
      amountKop: 49_950,
      status: "ACTIVE",
      interval: "MONTH",
      period: 1,
      lastChargeAt: null,
      nextChargeAt: new Date("2021-12-03T21:00:00Z"),
      successfulCharges: 2,
      failedCharges: 0,
    });
  });

  it("changes the amount of a subscription that still charges", async () => {
    for (const Status of ["Active", "PastDue"]) {
      const { api, calls } = apiWith(
        ok({ ...SUBSCRIPTION_MODEL, Status }),
        ok({ ...SUBSCRIPTION_MODEL, Status, Amount: 300 }),
      );

      const subscription = await api.updateSubscription({
        subscriptionId: SUBSCRIPTION_MODEL.Id,
        amountKop: 30_000,
      });

      expect(calls.map((call) => call.url)).toEqual([
        `${API_URL}/subscriptions/get`,
        `${API_URL}/subscriptions/update`,
      ]);
      expect(calls[1]!.body).toEqual({
        Id: SUBSCRIPTION_MODEL.Id,
        Amount: 300,
        Currency: "RUB",
      });
      expect(subscription).toMatchObject({ amountKop: 30_000 });
    }
  });

  // CloudPayments would reactivate it — and charge a donor who had cancelled.
  it.each(["Cancelled", "Rejected", "Expired"])(
    "doesn't touch a %s subscription",
    async (Status) => {
      const { api, calls } = apiWith(ok({ ...SUBSCRIPTION_MODEL, Status }));

      const error = await errorOf(
        api.updateSubscription({
          subscriptionId: SUBSCRIPTION_MODEL.Id,
          amountKop: 30_000,
        }),
      );

      expect(error.code).toBe("REJECTED");
      expect(error.outcome).toBe("not-performed");
      expect(error.providerMessage).toBe(
        `Subscription is ${Status.toUpperCase()}`,
      );
      expect(calls.map((call) => call.url)).toEqual([
        `${API_URL}/subscriptions/get`,
      ]);
    },
  );

  it("doesn't change a subscription it couldn't read first", async () => {
    const { api, calls } = apiWith(new TypeError("fetch failed"));

    const error = await errorOf(
      api.updateSubscription({
        subscriptionId: SUBSCRIPTION_MODEL.Id,
        amountKop: 30_000,
      }),
    );

    expect(error.code).toBe("UNAVAILABLE");
    expect(calls).toHaveLength(1);
  });

  it.each([
    ["an amount with fractions of a kopeck", { Amount: 499.555 }],
    ["another currency", { Currency: "USD" }],
    ["an unknown status", { Status: "Paused" }],
    ["a broken date", { NextTransactionDateIso: "soon" }],
  ])("refuses a subscription with %s", async (_what, change) => {
    const { api } = apiWith(ok({ ...SUBSCRIPTION_MODEL, ...change }));

    const error = await errorOf(
      api.getSubscription({ subscriptionId: SUBSCRIPTION_MODEL.Id }),
    );

    expect(error.code).toBe("BAD_RESPONSE");
    expect(error.message).toContain(Object.keys(change)[0]);
  });

  it("sends nothing for a bad amount or id", async () => {
    const { api, calls } = apiWith();

    for (const input of [
      { subscriptionId: "", amountKop: 50_000 },
      { subscriptionId: "sc_1", amountKop: 0 },
      { subscriptionId: "sc_1", amountKop: 499.5 },
    ]) {
      expect((await errorOf(api.updateSubscription(input))).code).toBe(
        "INVALID_INPUT",
      );
    }
    for (const subscriptionId of ["", "sc 1"]) {
      expect(
        (await errorOf(api.cancelSubscription({ subscriptionId }))).code,
      ).toBe("INVALID_INPUT");
      expect(
        (await errorOf(api.getSubscription({ subscriptionId }))).code,
      ).toBe("INVALID_INPUT");
    }
    expect(calls).toHaveLength(0);
  });
});

/** A transaction as in the docs' example of v2/payments/list. */
function transaction(overrides: Record<string, unknown> = {}) {
  return {
    PublicId: "test_api_00000000000000000000001",
    TransactionId: 54,
    Amount: 12.34,
    Currency: "RUB",
    CurrencyCode: 0,
    PaymentAmount: 12.34,
    PaymentCurrency: "RUB",
    InvoiceId: "1234567",
    AccountId: "User@Example.com",
    Email: null,
    Description: "Оплата товаров в example.com",
    JsonData: '{"some": "value"}',
    CreatedDate: "/Date(1615288374632)/",
    CreatedDateIso: "2021-03-09T11:12:54",
    TestMode: true,
    OriginalTransactionId: null,
    Status: "Completed",
    StatusCode: 3,
    Reason: "Approved",
    ReasonCode: 0,
    Type: 0,
    Refunded: false,
    SubscriptionId: null,
    GatewayName: "Test",
    TotalFee: 0.36,
    ...overrides,
  };
}

const DAY = {
  from: new Date("2021-03-08T21:00:00Z"),
  to: new Date("2021-03-09T21:00:00Z"),
};

describe("listTransactions", () => {
  it("asks for the period in UTC and maps transactions", async () => {
    const { api, calls } = apiWith(ok([transaction()]));

    const registry = await api.listTransactions(DAY);

    expect(calls[0]!.url).toBe(`${API_URL}/v2/payments/list`);
    expect(calls[0]!.body).toEqual({
      CreatedDateGte: "2021-03-08T21:00:00+00:00",
      CreatedDateLte: "2021-03-09T21:00:00+00:00",
      PageNumber: 1,
    });
    expect(registry).toEqual({
      transactions: [
        {
          providerTxId: "54",
          kind: "payment",
          status: "COMPLETED",
          amountKop: 1234,
          feeKop: 36,
          createdAt: new Date("2021-03-09T11:12:54.632Z"),
          testMode: true,
          invoiceId: "1234567",
          accountId: "User@Example.com",
          email: null,
          subscriptionId: null,
          originalTxId: null,
          metadata: { some: "value" },
        },
      ],
      testTransactions: [],
      unreadable: [],
    });
  });

  // Production with a terminal left in test mode: the registry is full of
  // "payments" no money stands behind.
  it("keeps test transactions out of the registry where they aren't money", async () => {
    const rows = [
      transaction({ TransactionId: 80, TestMode: true }),
      transaction({ TransactionId: 81, TestMode: false }),
      transaction({ TransactionId: 82, TestMode: true, Status: "Declined" }),
    ];
    const calls: unknown[] = [];
    const live = createCloudPaymentsApi({
      ...CREDENTIALS,
      acceptTestPayments: false,
      fetch: (_url, init) => {
        calls.push(init?.body);
        return Promise.resolve(ok(rows));
      },
    });
    const { api: staging } = apiWith(ok(rows));

    const production = await live.listTransactions(DAY);
    const onStaging = await staging.listTransactions(DAY);

    expect(calls).toHaveLength(1);
    expect(production.transactions.map((item) => item.providerTxId)).toEqual([
      "81",
    ]);
    expect(
      production.testTransactions.map((item) => item.providerTxId),
    ).toEqual(["80", "82"]);
    expect(onStaging.transactions).toHaveLength(3);
    expect(onStaging.testTransactions).toEqual([]);
  });

  it("reads refunds, declines and missing fees", async () => {
    const { api } = apiWith(
      ok([
        transaction({ TransactionId: 60, Status: "Declined", TotalFee: null }),
        transaction({
          TransactionId: 61,
          Type: 1,
          OriginalTransactionId: 54,
          TotalFee: undefined,
          InvoiceId: "",
          JsonData: null,
        }),
      ]),
    );

    const { transactions, unreadable } = await api.listTransactions(DAY);

    expect(unreadable).toEqual([]);
    expect(transactions).toMatchObject([
      { providerTxId: "60", kind: "payment", status: "DECLINED", feeKop: null },
      {
        providerTxId: "61",
        kind: "refund",
        originalTxId: "54",
        feeKop: null,
        invoiceId: null,
        metadata: null,
      },
    ]);
  });

  it("follows pages until a short one", async () => {
    const page = (first: number, count: number) =>
      ok(
        Array.from({ length: count }, (_, index) =>
          transaction({
            TransactionId: first + index,
            CreatedDate: `/Date(${1615288374632 + first + index})/`,
          }),
        ),
      );
    const { api, calls } = apiWith(page(1, 100), page(101, 100), page(201, 7));

    const { transactions } = await api.listTransactions(DAY);

    expect(
      calls.map((call) => (call.body as { PageNumber: number }).PageNumber),
    ).toEqual([1, 2, 3]);
    expect(transactions).toHaveLength(207);
    expect(transactions[0]!.providerTxId).toBe("1");
    expect(transactions.at(-1)!.providerTxId).toBe("207");
  });

  it("asks for one more page after a full one", async () => {
    const full = ok(
      Array.from({ length: 100 }, (_, index) =>
        transaction({ TransactionId: index + 1 }),
      ),
    );
    const { api, calls } = apiWith(full, ok([]));

    expect((await api.listTransactions(DAY)).transactions).toHaveLength(100);
    expect(calls).toHaveLength(2);
  });

  it("keeps to [from, to) exactly and lists a transaction once", async () => {
    const at = (iso: string) => `/Date(${Date.parse(iso)})/`;
    const { api, calls } = apiWith(
      ok([
        transaction({
          TransactionId: 1,
          CreatedDate: at("2021-03-08T20:59:59.999Z"),
        }),
        transaction({
          TransactionId: 2,
          CreatedDate: at("2021-03-08T21:00:00.000Z"),
        }),
        transaction({
          TransactionId: 3,
          CreatedDate: at("2021-03-09T20:59:59.999Z"),
        }),
        transaction({
          TransactionId: 3,
          CreatedDate: at("2021-03-09T20:59:59.999Z"),
        }),
        transaction({
          TransactionId: 4,
          CreatedDate: at("2021-03-09T21:00:00.000Z"),
        }),
      ]),
    );

    const { transactions } = await api.listTransactions({
      from: new Date("2021-03-08T21:00:00.000Z"),
      to: new Date("2021-03-09T21:00:00.000Z"),
    });

    expect(transactions.map((item) => item.providerTxId)).toEqual(["2", "3"]);
    expect(calls).toHaveLength(1);
  });

  it("widens a period with milliseconds to whole seconds", async () => {
    const { api, calls } = apiWith(ok([]));

    await api.listTransactions({
      from: new Date("2021-03-08T21:00:00.500Z"),
      to: new Date("2021-03-09T21:00:00.500Z"),
    });

    expect(calls[0]!.body).toMatchObject({
      CreatedDateGte: "2021-03-08T21:00:00+00:00",
      CreatedDateLte: "2021-03-09T21:00:01+00:00",
    });
  });

  // A row stays in the registry forever: if it failed the whole answer, that
  // day would never be reconciled.
  it.each([
    ["an amount with fractions of a kopeck", { Amount: 12.345 }, ["Amount"]],
    ["a fee with fractions of a kopeck", { TotalFee: 0.365 }, ["TotalFee"]],
    ["another currency", { Currency: "USD" }, ["Currency"]],
    ["an unknown status", { Status: "Pending" }, ["Status"]],
    ["an unknown type", { Type: 7 }, ["Type"]],
    [
      "a date in another format",
      { CreatedDate: "2021-03-09T11:12:54" },
      ["CreatedDate"],
    ],
  ])(
    "sets aside a row with %s and reads the rest",
    async (_what, change, fields) => {
      const { api } = apiWith(
        ok([
          transaction({ TransactionId: 54 }),
          transaction({ TransactionId: 55, ...change }),
          transaction({ TransactionId: 56 }),
        ]),
      );

      const { transactions, unreadable } = await api.listTransactions(DAY);

      expect(transactions.map((item) => item.providerTxId)).toEqual([
        "54",
        "56",
      ]);
      expect(unreadable).toEqual([{ providerTxId: "55", fields }]);
    },
  );

  it("sets aside a row without a readable id", async () => {
    const { api } = apiWith(ok([transaction({ TransactionId: null }), "junk"]));

    const { transactions, unreadable } = await api.listTransactions(DAY);

    expect(transactions).toEqual([]);
    expect(unreadable).toEqual([
      { providerTxId: null, fields: ["TransactionId"] },
      { providerTxId: null, fields: ["(root)"] },
    ]);
  });

  // The number of a refund's Type is a guess until a test terminal confirms
  // it. A refund read as a payment would become a donation in reconciliation.
  it.each([
    [
      "a payment that points at an original",
      { Type: 0, OriginalTransactionId: 54 },
    ],
    [
      "a refund that points at nothing",
      { Type: 1, OriginalTransactionId: null },
    ],
  ])("sets aside %s", async (_what, change) => {
    const { api } = apiWith(
      ok([transaction({ TransactionId: 70, ...change })]),
    );

    const { transactions, unreadable } = await api.listTransactions(DAY);

    expect(transactions).toEqual([]);
    expect(unreadable).toEqual([
      { providerTxId: "70", fields: ["Type", "OriginalTransactionId"] },
    ]);
  });

  it("never quotes an unreadable row", async () => {
    const { api } = apiWith(
      ok([transaction({ Amount: "donor@shelter.localhost" })]),
    );

    const { unreadable } = await api.listTransactions(DAY);

    expect(JSON.stringify(unreadable)).not.toContain("donor");
  });

  it("fails when the answer isn't a list at all", async () => {
    const { api } = apiWith(ok({ rows: [] }));

    const error = await errorOf(api.listTransactions(DAY));

    expect(error.code).toBe("BAD_RESPONSE");
  });

  it("refuses an empty or reversed period", async () => {
    const { api, calls } = apiWith();

    for (const period of [
      { from: DAY.to, to: DAY.from },
      { from: DAY.from, to: DAY.from },
      { from: new Date(Number.NaN), to: DAY.to },
    ]) {
      expect((await errorOf(api.listTransactions(period))).code).toBe(
        "INVALID_INPUT",
      );
    }
    expect(calls).toHaveLength(0);
  });
});
