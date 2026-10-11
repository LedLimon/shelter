import { z } from "zod";
import { MAX_AMOUNT_KOP } from "@/lib/money";
import { PaymentProviderError } from "./errors";
import type { PaymentIntent } from "./types";

const text = z.string().trim().min(1);

const intentSchema = z
  .object({
    invoiceId: text,
    amountKop: z.int().min(1).max(MAX_AMOUNT_KOP),
    description: text,
    email: z.email(),
    accountId: text.optional(),
    metadata: z.record(z.string(), z.json()),
    recurrent: z
      .object({
        interval: z.literal("MONTH"),
        period: z.int().min(1),
        amountKop: z.int().min(1).max(MAX_AMOUNT_KOP).optional(),
      })
      .optional(),
    returnUrl: z.url({ protocol: /^https?$/ }),
  })
  // CloudPayments can't start a subscription without the payer's id.
  .refine((intent) => !intent.recurrent || intent.accountId, {
    path: ["accountId"],
    message: "is required for a recurrent payment",
  });

/**
 * Checks an intent the same way for every provider, so that the fake accepts
 * nothing CloudPayments wouldn't get. The error names fields, never values:
 * an intent carries the donor's email.
 */
export function assertPaymentIntent(intent: PaymentIntent): void {
  const result = intentSchema.safeParse(intent);
  if (result.success) return;

  const fields = new Set(
    result.error.issues.map((issue) => issue.path.join(".") || "intent"),
  );
  throw new PaymentProviderError(
    "INVALID_INPUT",
    `invalid payment intent: ${[...fields].join(", ")}`,
  );
}
