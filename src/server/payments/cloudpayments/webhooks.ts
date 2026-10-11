// CloudPayments notifications → PaymentEvent. Checked against
// developers.cloudpayments.ru («Уведомления») on 2026-10-11; the terminal must
// send them as POST, format «CloudPayments», encoding UTF-8.
//
// Only fields we use are read, so a new or reformatted field we don't need
// can't break a payment. What we do read is strict: an amount or a date we
// can't read exactly is an error, never a guess.
import { createHash } from "node:crypto";
import { decimalRubToKop } from "@/lib/money";
import { WebhookParseError } from "../errors";
import {
  WEBHOOK_TYPES,
  type ChargeDetails,
  type JsonValue,
  type PaymentEvent,
  type ProviderSubscription,
  type ProviderSubscriptionStatus,
  type WebhookType,
} from "../types";

const TRANSACTION_ID = /^\d{1,19}$/;
const DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z?$/;
const COUNT = /^\d{1,9}$/;

const SUBSCRIPTION_STATUS: Record<string, ProviderSubscriptionStatus> = {
  Active: "ACTIVE",
  PastDue: "PAST_DUE",
  Cancelled: "CANCELLED",
  Rejected: "REJECTED",
  Expired: "EXPIRED",
};

const INTERVAL: Record<string, ProviderSubscription["interval"]> = {
  Day: "DAY",
  Week: "WEEK",
  Month: "MONTH",
};

export function isWebhookType(type: string): type is WebhookType {
  return (WEBHOOK_TYPES as readonly string[]).includes(type);
}

/**
 * CloudPayments' times are UTC without a zone: "2026-10-11 09:15:42" in
 * notifications, "2026-10-11T09:15:42" in API answers. Null if it isn't one
 * (including dates that don't exist, which Date would silently roll over).
 */
export function parseUtcDateTime(value: string): Date | null {
  const match = DATE_TIME.exec(value);
  if (!match) return null;

  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day, hour, minute, second));
  const rollsOver =
    date.getUTCMonth() !== month! - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second;
  return rollsOver ? null : date;
}

/** Metadata we passed to the widget; null if absent or not JSON. */
export function parseMetadata(value: string | null): JsonValue | null {
  if (value === null) return null;
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return null;
  }
}

/** Reads fields of one notification and collects what is wrong with them. */
class Notification {
  private readonly fields = new Map<string, string>();
  private readonly invalid = new Set<string>();
  private readonly unsupported: string[] = [];

  constructor(
    private readonly type: WebhookType,
    rawBody: string,
  ) {
    for (const [name, value] of new URLSearchParams(rawBody)) {
      // A repeated field would make "which one counts" a guess.
      if (this.fields.has(name)) this.invalid.add(name);
      this.fields.set(name, value);
    }
  }

  /** An empty value is how CloudPayments sends "none". */
  optional(name: string): string | null {
    return this.fields.get(name) || null;
  }

  required(name: string): string {
    const value = this.optional(name);
    if (value === null) this.invalid.add(name);
    return value ?? "";
  }

  private read<T>(name: string, parse: (value: string) => T | null): T | null {
    const value = this.optional(name);
    if (value === null) return null;
    const parsed = parse(value);
    if (parsed === null) this.invalid.add(name);
    return parsed;
  }

  private need<T>(
    name: string,
    parse: (value: string) => T | null,
    fallback: T,
  ): T {
    return this.read(name, parse) ?? (this.invalid.add(name), fallback);
  }

  transactionId(name: string): string {
    return this.need(name, (v) => (TRANSACTION_ID.test(v) ? v : null), "");
  }

  /** Rubles with a dot → kopecks; a payment of nothing isn't a payment. */
  amountKop(name: string): number {
    return this.need(
      name,
      (v) => {
        const kop = decimalRubToKop(v);
        return kop !== null && kop > 0 ? kop : null;
      },
      0,
    );
  }

  dateTime(name: string): Date {
    return this.need(name, parseUtcDateTime, new Date(0));
  }

  optionalDateTime(name: string): Date | null {
    return this.read(name, parseUtcDateTime);
  }

  count(name: string): number {
    return this.need(name, (v) => (COUNT.test(v) ? Number(v) : null), 0);
  }

  flag(name: string): boolean {
    return this.need(
      name,
      (v) => {
        const text = v.toLowerCase();
        if (text === "1" || text === "true") return true;
        if (text === "0" || text === "false") return false;
        return null;
      },
      false,
    );
  }

  oneOf<T>(name: string, values: Record<string, T>, fallback: T): T {
    return this.need(
      name,
      (v) => (Object.hasOwn(values, v) ? values[v]! : null),
      fallback,
    );
  }

  /** The value is valid for CloudPayments but not something we take. */
  reject(reason: string): void {
    this.unsupported.push(reason);
  }

  /** Throws if anything read so far was wrong. Field names only, no values. */
  assertValid(): void {
    if (this.invalid.size > 0) {
      throw new WebhookParseError(
        "MALFORMED",
        `${this.type} notification: missing or invalid ${[...this.invalid].join(", ")}`,
      );
    }
    if (this.unsupported.length > 0) {
      throw new WebhookParseError(
        "UNSUPPORTED",
        `${this.type} notification: ${this.unsupported.join("; ")}`,
      );
    }
  }
}

/** Only rubles: an amount in another currency must not be read as rubles. */
function requireRub(n: Notification): void {
  const currency = n.required("Currency");
  if (currency && currency !== "RUB") n.reject("Currency is not RUB");
}

function charge(n: Notification): ChargeDetails {
  requireRub(n);
  return {
    providerTxId: n.transactionId("TransactionId"),
    invoiceId: n.optional("InvoiceId"),
    amountKop: n.amountKop("Amount"),
    occurredAt: n.dateTime("DateTime"),
    testMode: n.flag("TestMode"),
    accountId: n.optional("AccountId"),
    email: n.optional("Email"),
    subscriptionId: n.optional("SubscriptionId"),
    method: n.optional("PaymentMethod"),
    metadata: parseMetadata(n.optional("Data")),
  };
}

type Operation = "payment" | "refund" | "payout";

const OPERATION: Record<string, Operation> = {
  Payment: "payment",
  Refund: "refund",
  CardPayout: "payout",
};

function operation(n: Notification): "payment" | "refund" {
  const value = n.oneOf("OperationType", OPERATION, "payment");
  if (value === "payout") n.reject("card payouts are not supported");
  return value === "refund" ? "refund" : "payment";
}

/**
 * "Authorized" is a two-stage payment: the money is only held and returns to
 * the donor unless confirmed. We run one-stage payments and never confirm, so
 * such a payment must not be taken for received money.
 */
function requireOneStage(n: Notification): void {
  const status = n.oneOf(
    "Status",
    { Completed: "completed", Authorized: "authorized" },
    "completed",
  );
  if (status === "authorized") {
    n.reject("two-stage payments (Status Authorized) are not supported");
  }
}

function subscription(n: Notification): ProviderSubscription {
  requireRub(n);
  return {
    id: n.required("Id"),
    accountId: n.required("AccountId"),
    email: n.optional("Email"),
    amountKop: n.amountKop("Amount"),
    status: n.oneOf("Status", SUBSCRIPTION_STATUS, "ACTIVE"),
    interval: n.oneOf("Interval", INTERVAL, "MONTH"),
    period: n.count("Period"),
    startAt: n.dateTime("StartDate"),
    lastChargeAt: n.optionalDateTime("LastTransactionDate"),
    nextChargeAt: n.optionalDateTime("NextTransactionDate"),
    successfulCharges: n.count("SuccessfulTransactionsNumber"),
    failedCharges: n.count("FailedTransactionsNumber"),
  };
}

function read(n: Notification, type: WebhookType, rawBody: string) {
  switch (type) {
    case "check": {
      const details = charge(n);
      requireOneStage(n);
      return {
        type,
        operation: operation(n),
        dedupeKey: `cp:check:${details.providerTxId}`,
        ...details,
      } satisfies PaymentEvent;
    }
    case "pay": {
      const details = charge(n);
      requireOneStage(n);
      if (operation(n) !== "payment") n.reject("OperationType is not Payment");
      return {
        type,
        dedupeKey: `cp:pay:${details.providerTxId}`,
        ...details,
      } satisfies PaymentEvent;
    }
    case "fail": {
      const details = charge(n);
      return {
        type,
        operation: operation(n),
        reasonCode: n.count("ReasonCode"),
        reason: n.required("Reason"),
        dedupeKey: `cp:fail:${details.providerTxId}`,
        ...details,
      } satisfies PaymentEvent;
    }
    case "refund": {
      const refundTxId = n.transactionId("TransactionId");
      if (operation(n) !== "refund") n.reject("OperationType is not Refund");
      return {
        type,
        refundTxId,
        paymentTxId: n.transactionId("PaymentTransactionId"),
        amountKop: n.amountKop("Amount"),
        occurredAt: n.dateTime("DateTime"),
        invoiceId: n.optional("InvoiceId"),
        accountId: n.optional("AccountId"),
        email: n.optional("Email"),
        metadata: parseMetadata(n.optional("Data")),
        dedupeKey: `cp:refund:${refundTxId}`,
      } satisfies PaymentEvent;
    }
    case "recurrent": {
      const details = subscription(n);
      // A status change has no id of its own. Retries repeat the body, while
      // two different changes differ in status, counters or dates.
      const digest = createHash("sha256").update(rawBody, "utf8").digest("hex");
      return {
        type,
        subscription: details,
        dedupeKey: `cp:recurrent:${details.id}:${digest.slice(0, 32)}`,
      } satisfies PaymentEvent;
    }
  }
}

/**
 * The event of a CloudPayments notification. `type` is the last segment of
 * the notification URL. Call it only on a body that passed the signature
 * check.
 */
export function parseWebhook(type: string, rawBody: string): PaymentEvent {
  if (!isWebhookType(type)) {
    throw new WebhookParseError("UNKNOWN_TYPE", "unknown notification type");
  }
  const notification = new Notification(type, rawBody);
  const event = read(notification, type, rawBody);
  notification.assertValid();
  return event;
}
