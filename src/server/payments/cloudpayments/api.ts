// CloudPayments' HTTP API. Checked against developers.cloudpayments.ru
// («API») on 2026-10-11: POST with JSON, HTTP Basic auth (Public ID as the
// login, API Secret as the password), X-Request-ID for idempotency, answers
// as { Success, Message, Model }.
import { z } from "zod";
import { decimalRubToKop, kopToDecimalRub } from "@/lib/money";
import { PaymentProviderError } from "../errors";
import {
  parsePeriod,
  parseRefundInput,
  parseSubscriptionInput,
  parseUpdateSubscriptionInput,
} from "../input";
import type {
  ListTransactionsInput,
  ProviderSubscription,
  ProviderTransaction,
  RefundInput,
  TransactionRegistry,
  UnreadableTransaction,
} from "../types";
import { parseMetadata, parseUtcDateTime } from "./webhooks";

export const API_URL = "https://api.cloudpayments.ru";

/** v2/payments/list returns at most this many transactions per page. */
const PAGE_SIZE = 100;
/** A day of a shelter is a page or two; this only stops a runaway loop. */
const MAX_PAGES = 1000;
const DEFAULT_TIMEOUT_MS = 30_000;

export type CloudPaymentsApiConfig = {
  publicId: string;
  apiSecret: string;
  /** For tests; the global fetch by default. */
  fetch?: typeof fetch;
  timeoutMs?: number;
};

const SUBSCRIPTION_STATUS = {
  Active: "ACTIVE",
  PastDue: "PAST_DUE",
  Cancelled: "CANCELLED",
  Rejected: "REJECTED",
  Expired: "EXPIRED",
} as const;

const INTERVAL = { Day: "DAY", Week: "WEEK", Month: "MONTH" } as const;

const TRANSACTION_STATUS = {
  AwaitingAuthentication: "AWAITING_AUTHENTICATION",
  Authorized: "AUTHORIZED",
  Completed: "COMPLETED",
  Cancelled: "CANCELLED",
  Declined: "DECLINED",
} as const;

const envelopeSchema = z.object({
  Success: z.boolean(),
  Message: z.string().nullish(),
  // Absent in answers that carry no data (subscriptions/cancel, refusals).
  Model: z.unknown().optional(),
});

const text = z
  .string()
  .nullish()
  .transform((value) => value || null);

const id = z
  .int()
  .min(0)
  .transform((value) => String(value));

/** A ruble amount as a JSON number → kopecks, exactly. */
const amountKop = z.number().transform((value, ctx) => {
  const kop = decimalRubToKop(value);
  if (kop !== null) return kop;
  ctx.addIssue({ code: "custom", message: "not an amount" });
  return z.NEVER;
});

const isoDate = z.string().transform((value, ctx) => {
  const date = parseUtcDateTime(value);
  if (date) return date;
  ctx.addIssue({ code: "custom", message: "not a date" });
  return z.NEVER;
});

const rub = z.literal("RUB");

const subscriptionSchema = z
  .object({
    Id: z.string().min(1),
    AccountId: z.string().min(1),
    Email: text,
    Amount: amountKop,
    Currency: rub,
    Interval: z.enum(["Day", "Week", "Month"]),
    Period: z.int().min(1),
    Status: z.enum(["Active", "PastDue", "Cancelled", "Rejected", "Expired"]),
    SuccessfulTransactionsNumber: z.int().min(0),
    FailedTransactionsNumber: z.int().min(0),
    LastTransactionDateIso: isoDate.nullish(),
    NextTransactionDateIso: isoDate.nullish(),
  })
  .transform((model): ProviderSubscription => ({
    id: model.Id,
    accountId: model.AccountId,
    email: model.Email,
    amountKop: model.Amount,
    status: SUBSCRIPTION_STATUS[model.Status],
    interval: INTERVAL[model.Interval],
    period: model.Period,
    lastChargeAt: model.LastTransactionDateIso ?? null,
    nextChargeAt: model.NextTransactionDateIso ?? null,
    successfulCharges: model.SuccessfulTransactionsNumber,
    failedCharges: model.FailedTransactionsNumber,
  }));

// `Type` is a number in API answers. The docs' examples show 0 for a payment
// and 2 for a card payout; 1 for a refund follows their «Типы операций»
// order and is to be confirmed on a test terminal (ORG-2). Until then the
// link to the original payment is the cross-check: a refund has it, a payment
// doesn't, and a row where the two disagree is unreadable — a refund taken
// for a payment would become a donation in reconciliation.
const TRANSACTION_KIND = ["payment", "refund", "payout"] as const;

// "/Date(1615288374632)/": milliseconds since the epoch, no time zone to guess.
const EPOCH_DATE = /^\/Date\((\d{1,15})\)\/$/;

const transactionSchema = z
  .object({
    TransactionId: id,
    Type: z.int().min(0).max(2),
    Status: z.enum([
      "AwaitingAuthentication",
      "Authorized",
      "Completed",
      "Cancelled",
      "Declined",
    ]),
    Amount: amountKop,
    Currency: rub,
    TotalFee: amountKop.nullish(),
    CreatedDate: z.string().regex(EPOCH_DATE),
    TestMode: z.boolean(),
    InvoiceId: text,
    AccountId: text,
    Email: text,
    SubscriptionId: text,
    OriginalTransactionId: id.nullish(),
    JsonData: text,
  })
  .superRefine((model, ctx) => {
    const kind = TRANSACTION_KIND[model.Type];
    const hasOriginal = model.OriginalTransactionId != null;
    if (kind !== "payout" && (kind === "refund") !== hasOriginal) {
      for (const field of ["Type", "OriginalTransactionId"]) {
        ctx.addIssue({ code: "custom", path: [field], message: "mismatch" });
      }
    }
  })
  .transform((model): ProviderTransaction => ({
    providerTxId: model.TransactionId,
    kind: TRANSACTION_KIND[model.Type]!,
    status: TRANSACTION_STATUS[model.Status],
    amountKop: model.Amount,
    feeKop: model.TotalFee ?? null,
    createdAt: new Date(Number(EPOCH_DATE.exec(model.CreatedDate)![1])),
    testMode: model.TestMode,
    invoiceId: model.InvoiceId,
    accountId: model.AccountId,
    email: model.Email,
    subscriptionId: model.SubscriptionId,
    originalTxId: model.OriginalTransactionId ?? null,
    metadata: parseMetadata(model.JsonData),
  }));

const refundModelSchema = z.object({ TransactionId: id });

/** Names of the fields that failed, never their values. */
function fieldsOf(error: z.ZodError): string[] {
  const names = error.issues.map((issue) => issue.path.join(".") || "(root)");
  return [...new Set(names)];
}

function parseModel<Schema extends z.ZodType>(
  schema: Schema,
  model: unknown,
  path: string,
): z.output<Schema> {
  const result = schema.safeParse(model);
  if (result.success) return result.data;
  throw new PaymentProviderError(
    "BAD_RESPONSE",
    `unexpected answer of ${path}: ${fieldsOf(result.error).join(", ")}`,
  );
}

/** The id of a registry row we couldn't read, if at least that is readable. */
function idOf(row: unknown): string | null {
  const result = refundModelSchema.safeParse(row);
  return result.success ? result.data.TransactionId : null;
}

/** "2026-10-11T00:00:00+00:00": the format of the docs' examples, in UTC. */
function isoSeconds(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

export function createCloudPaymentsApi(config: CloudPaymentsApiConfig) {
  const { publicId, apiSecret, timeoutMs = DEFAULT_TIMEOUT_MS } = config;
  if (!publicId || !apiSecret) {
    throw new Error("payments: CloudPayments credentials are empty");
  }
  const authorization = `Basic ${Buffer.from(`${publicId}:${apiSecret}`, "utf8").toString("base64")}`;

  /** POSTs to the API and returns Model of a successful answer. */
  async function call(
    path: string,
    body: Record<string, unknown>,
    requestId?: string,
  ): Promise<unknown> {
    // Looked up per call, so tests can stub the global.
    const send = config.fetch ?? fetch;
    let response: Response;
    let answer: string;
    try {
      response = await send(`${API_URL}/${path}`, {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
          ...(requestId && { "X-Request-ID": requestId }),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      answer = await response.text();
    } catch {
      // Not rethrown with its cause: nothing about the request belongs in logs.
      throw new PaymentProviderError(
        "UNAVAILABLE",
        `${path}: no answer from CloudPayments`,
      );
    }

    if (response.status === 401) {
      throw new PaymentProviderError(
        "UNAUTHORIZED",
        `${path}: CloudPayments rejected the credentials`,
      );
    }
    if (response.status === 429) {
      throw new PaymentProviderError("RATE_LIMITED", `${path}: HTTP 429`);
    }
    if (response.status >= 500) {
      throw new PaymentProviderError(
        "UNAVAILABLE",
        `${path}: HTTP ${response.status}`,
      );
    }
    let payload: unknown = null;
    try {
      payload = JSON.parse(answer);
    } catch {
      // Falls through to BAD_RESPONSE below.
    }
    const envelope = envelopeSchema.safeParse(payload);
    if (!response.ok || !envelope.success) {
      throw new PaymentProviderError(
        "BAD_RESPONSE",
        `${path}: unexpected answer (HTTP ${response.status})`,
      );
    }
    if (!envelope.data.Success) {
      throw new PaymentProviderError(
        "REJECTED",
        `${path}: CloudPayments refused the request`,
        envelope.data.Message ?? null,
      );
    }
    return envelope.data.Model;
  }

  async function getSubscription(input: {
    subscriptionId: string;
  }): Promise<ProviderSubscription> {
    const { subscriptionId } = parseSubscriptionInput(input);
    const model = await call("subscriptions/get", { Id: subscriptionId });
    return parseModel(subscriptionSchema, model, "subscriptions/get");
  }

  return {
    async refund(input: RefundInput): Promise<{ refundTxId: string }> {
      const { providerTxId, amountKop, idempotencyKey } =
        parseRefundInput(input);
      const model = await call(
        "payments/refund",
        {
          TransactionId: Number(providerTxId),
          Amount: Number(kopToDecimalRub(amountKop)),
        },
        // The docs allow «guid, комбинация из номера заказа, даты и суммы или
        // любое другое значение»: our key goes as it is, readable in the
        // provider's logs.
        idempotencyKey,
      );
      const refund = parseModel(refundModelSchema, model, "payments/refund");
      return { refundTxId: refund.TransactionId };
    },

    async cancelSubscription(input: { subscriptionId: string }): Promise<void> {
      const { subscriptionId } = parseSubscriptionInput(input);
      await call("subscriptions/cancel", { Id: subscriptionId });
    },

    getSubscription,

    async updateSubscription(input: {
      subscriptionId: string;
      amountKop: number;
    }): Promise<ProviderSubscription> {
      const { subscriptionId, amountKop } = parseUpdateSubscriptionInput(input);
      // CloudPayments reactivates a cancelled or finished subscription on any
      // change. The donor may have cancelled it on my.cloudpayments.ru a
      // moment ago, whatever our database says — so the provider is asked
      // first. A cancellation between the two calls still slips through;
      // the returned status shows it.
      const current = await getSubscription({ subscriptionId });
      if (current.status !== "ACTIVE" && current.status !== "PAST_DUE") {
        throw new PaymentProviderError(
          "REJECTED",
          "subscriptions/update: the subscription is not active, not changed",
          `Subscription is ${current.status}`,
        );
      }
      const model = await call("subscriptions/update", {
        Id: subscriptionId,
        Amount: Number(kopToDecimalRub(amountKop)),
        Currency: "RUB",
      });
      return parseModel(subscriptionSchema, model, "subscriptions/update");
    },

    async listTransactions(
      input: ListTransactionsInput,
    ): Promise<TransactionRegistry> {
      const { from, to } = parsePeriod(input);
      const fromMs = from.getTime();
      const toMs = to.getTime();

      // The API takes whole seconds and both bounds inclusive: ask a little
      // wider and cut to [from, to) here.
      const period = {
        CreatedDateGte: isoSeconds(Math.floor(fromMs / 1000) * 1000),
        CreatedDateLte: isoSeconds(Math.ceil(toMs / 1000) * 1000),
      };
      const found = new Map<string, ProviderTransaction>();
      const unreadable: UnreadableTransaction[] = [];
      for (let page = 1; ; page++) {
        if (page > MAX_PAGES) {
          throw new PaymentProviderError(
            "BAD_RESPONSE",
            "v2/payments/list: too many pages",
          );
        }
        const model = await call("v2/payments/list", {
          ...period,
          PageNumber: page,
        });
        const rows = parseModel(
          z.array(z.unknown()),
          model,
          "v2/payments/list",
        );
        for (const row of rows) {
          const parsed = transactionSchema.safeParse(row);
          if (!parsed.success) {
            // Its time may be what is unreadable: reported whatever the period.
            unreadable.push({
              providerTxId: idOf(row),
              fields: fieldsOf(parsed.error),
            });
            continue;
          }
          const createdMs = parsed.data.createdAt.getTime();
          if (createdMs >= fromMs && createdMs < toMs) {
            found.set(parsed.data.providerTxId, parsed.data);
          }
        }
        if (rows.length < PAGE_SIZE) break;
      }
      return {
        transactions: [...found.values()].sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        ),
        unreadable,
      };
    },
  };
}
