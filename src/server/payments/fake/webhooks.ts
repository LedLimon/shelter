// Builds notifications the way CloudPayments sends them: a form-encoded body
// with the documented fields and both HMAC headers. FakeCloudPayments posts
// them to our endpoint; tests feed them to handlers (tests/helpers/cloudpayments.ts).
import { createHmac } from "node:crypto";
import { kopToDecimalRub } from "@/lib/money";
import type {
  JsonValue,
  ProviderSubscription,
  ProviderSubscriptionStatus,
  WebhookType,
} from "../types";

export type SimulatedWebhook = {
  type: WebhookType;
  /** application/x-www-form-urlencoded. */
  body: string;
  headers: {
    "Content-Type": string;
    "Content-HMAC": string;
    "X-Content-HMAC": string;
  };
};

/** Field values as they go on the wire; null and undefined are left out. */
export type WebhookFields = Record<string, string | null | undefined>;

function hmacBase64(message: string, apiSecret: string): string {
  return createHmac("sha256", apiSecret)
    .update(message, "utf8")
    .digest("base64");
}

/** Signs a ready body. Use it to send a body that is deliberately wrong. */
export function signWebhook(
  type: WebhookType,
  body: string,
  apiSecret: string,
): SimulatedWebhook {
  // CloudPayments computes X-Content-HMAC over the parameters before
  // URL-encoding; how exactly it joins them isn't documented, and we don't
  // verify this header (see cloudpayments/signature.ts).
  const decoded = [...new URLSearchParams(body)]
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
  return {
    type,
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-HMAC": hmacBase64(body, apiSecret),
      "X-Content-HMAC": hmacBase64(decoded, apiSecret),
    },
  };
}

/** A signed notification with these fields, in this order. */
export function simulateWebhook(
  type: WebhookType,
  fields: WebhookFields,
  apiSecret: string,
): SimulatedWebhook {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(fields)) {
    if (value !== null && value !== undefined) params.set(name, value);
  }
  return signWebhook(type, params.toString(), apiSecret);
}

/** "2026-10-11 09:15:42": UTC, as in notifications. */
export function formatUtcDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export type SimulatedCharge = {
  transactionId: string;
  amountKop: number;
  dateTime: Date;
  invoiceId?: string | null;
  accountId?: string | null;
  email?: string | null;
  subscriptionId?: string | null;
  description?: string | null;
  /** Goes out as Data. */
  metadata?: JsonValue | null;
  /** Default true: the simulator never moves real money. */
  testMode?: boolean;
  /** PaymentMethod, e.g. "Sbp"; a card payment has none. */
  paymentMethod?: string | null;
};

// A МИР test card from CloudPayments' docs.
const CARD: WebhookFields = {
  CardFirstSix: "220000",
  CardLastFour: "0004",
  CardType: "MIR",
  CardExpDate: "12/30",
};

function chargeFields(charge: SimulatedCharge): WebhookFields {
  const amount = kopToDecimalRub(charge.amountKop);
  return {
    TransactionId: charge.transactionId,
    Amount: amount,
    Currency: "RUB",
    PaymentAmount: amount,
    PaymentCurrency: "RUB",
    DateTime: formatUtcDateTime(charge.dateTime),
    ...(charge.paymentMethod ? {} : CARD),
    TestMode: charge.testMode === false ? "0" : "1",
    InvoiceId: charge.invoiceId,
    AccountId: charge.accountId,
    SubscriptionId: charge.subscriptionId,
    Email: charge.email,
    IpAddress: "127.0.0.1",
    Description: charge.description,
    PaymentMethod: charge.paymentMethod,
    Data:
      charge.metadata === null || charge.metadata === undefined
        ? null
        : JSON.stringify(charge.metadata),
  };
}

export function checkFields(charge: SimulatedCharge): WebhookFields {
  return {
    ...chargeFields(charge),
    Status: "Completed",
    OperationType: "Payment",
  };
}

export function payFields(charge: SimulatedCharge): WebhookFields {
  return {
    ...chargeFields(charge),
    Status: "Completed",
    OperationType: "Payment",
    GatewayName: "Test",
    AuthCode: "A1B2C3",
  };
}

/** Decline reasons from CloudPayments' «Коды ошибок». */
export const DECLINE = {
  insufficientFunds: { reasonCode: 5051, reason: "InsufficientFunds" },
  authenticationFailed: { reasonCode: 5206, reason: "AuthenticationFailed" },
} as const;

export function failFields(
  charge: SimulatedCharge,
  decline: { reasonCode: number; reason: string } = DECLINE.insufficientFunds,
): WebhookFields {
  return {
    ...chargeFields(charge),
    OperationType: "Payment",
    Reason: decline.reason,
    ReasonCode: String(decline.reasonCode),
  };
}

export type SimulatedRefund = {
  /** The refund's own transaction. */
  transactionId: string;
  /** The payment being returned. */
  paymentTransactionId: string;
  amountKop: number;
  dateTime: Date;
  invoiceId?: string | null;
  accountId?: string | null;
  email?: string | null;
  metadata?: JsonValue | null;
};

export function refundFields(refund: SimulatedRefund): WebhookFields {
  return {
    TransactionId: refund.transactionId,
    PaymentTransactionId: refund.paymentTransactionId,
    Amount: kopToDecimalRub(refund.amountKop),
    DateTime: formatUtcDateTime(refund.dateTime),
    OperationType: "Refund",
    InvoiceId: refund.invoiceId,
    AccountId: refund.accountId,
    Email: refund.email,
    Data:
      refund.metadata === null || refund.metadata === undefined
        ? null
        : JSON.stringify(refund.metadata),
  };
}

const STATUS_NAME: Record<ProviderSubscriptionStatus, string> = {
  ACTIVE: "Active",
  PAST_DUE: "PastDue",
  CANCELLED: "Cancelled",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};

const INTERVAL_NAME: Record<ProviderSubscription["interval"], string> = {
  DAY: "Day",
  WEEK: "Week",
  MONTH: "Month",
};

export function recurrentFields(
  subscription: ProviderSubscription,
  description = "Ежемесячное пожертвование",
): WebhookFields {
  return {
    Id: subscription.id,
    AccountId: subscription.accountId,
    Description: description,
    Email: subscription.email,
    Amount: kopToDecimalRub(subscription.amountKop),
    Currency: "RUB",
    RequireConfirmation: "false",
    StartDate: formatUtcDateTime(subscription.startAt),
    Interval: INTERVAL_NAME[subscription.interval],
    Period: String(subscription.period),
    Status: STATUS_NAME[subscription.status],
    SuccessfulTransactionsNumber: String(subscription.successfulCharges),
    FailedTransactionsNumber: String(subscription.failedCharges),
    LastTransactionDate:
      subscription.lastChargeAt && formatUtcDateTime(subscription.lastChargeAt),
    NextTransactionDate:
      subscription.nextChargeAt && formatUtcDateTime(subscription.nextChargeAt),
  };
}
