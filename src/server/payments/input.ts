// Argument checks shared by every provider, so that the fake accepts nothing
// CloudPayments' adapter would refuse. Errors name fields, never values:
// arguments carry the donor's email.
import { z } from "zod";
import { MAX_AMOUNT_KOP } from "@/lib/money";
import { PaymentProviderError } from "./errors";
import type {
  ListTransactionsInput,
  PaymentIntent,
  RefundInput,
} from "./types";

const text = z.string().trim().min(1);
const amountKop = z.int().min(1).max(MAX_AMOUNT_KOP);

const intentSchema = z
  .object({
    invoiceId: text,
    amountKop,
    description: text,
    email: z.email(),
    accountId: text.optional(),
    metadata: z.record(z.string(), z.json()),
    recurrent: z
      .object({
        interval: z.literal("MONTH"),
        period: z.int().min(1),
        amountKop: amountKop.optional(),
      })
      .optional(),
    returnUrl: z.url({ protocol: /^https?$/ }),
  })
  // CloudPayments can't start a subscription without the payer's id.
  .refine((intent) => !intent.recurrent || intent.accountId, {
    path: ["accountId"],
    message: "is required for a recurrent payment",
  });

const refundSchema = z.object({
  // A Long at CloudPayments; 15 digits always fit a JSON number exactly.
  providerTxId: z.string().regex(/^\d{1,15}$/),
  amountKop,
  // Sent as an HTTP header.
  idempotencyKey: z.string().regex(/^[\x21-\x7e]{1,128}$/),
});

const subscriptionId = z.string().regex(/^[\x21-\x7e]{1,128}$/);

const subscriptionSchema = z.object({ subscriptionId });

const updateSubscriptionSchema = z.object({ subscriptionId, amountKop });

const instant = z.date().refine((date) => !Number.isNaN(date.getTime()));

const periodSchema = z
  .object({ from: instant, to: instant })
  .refine(({ from, to }) => from < to, { path: ["to"] });

function parse<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
  what: string,
): z.output<Schema> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const fields = new Set(
    result.error.issues.map((issue) => issue.path.join(".") || what),
  );
  throw new PaymentProviderError(
    "INVALID_INPUT",
    `invalid ${what}: ${[...fields].join(", ")}`,
  );
}

export function assertPaymentIntent(intent: PaymentIntent): void {
  parse(intentSchema, intent, "payment intent");
}

export function parseRefundInput(input: RefundInput): RefundInput {
  return parse(refundSchema, input, "refund");
}

export function parseSubscriptionInput(input: { subscriptionId: string }) {
  return parse(subscriptionSchema, input, "subscription");
}

export function parseUpdateSubscriptionInput(input: {
  subscriptionId: string;
  amountKop: number;
}) {
  return parse(updateSubscriptionSchema, input, "subscription");
}

export function parsePeriod(input: ListTransactionsInput) {
  return parse(periodSchema, input, "period");
}
