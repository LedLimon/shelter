"use server";

import { randomBytes } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { MAX_AMOUNT_KOP } from "@/lib/money";
import { FAKE_CHECKOUT_PATH } from "@/server/payments/fake";
import { requireFakeCloudPayments } from "./guard";

// Server actions of the emulator. No staff permission to check: they stand
// in for the provider's widget, which any donor uses. Each one starts with
// requireFakeCloudPayments(): with a real provider they don't exist.

const checkoutId = z.string().min(1).max(64);

const testPaymentSchema = z.object({
  amountKop: z.int().min(1).max(MAX_AMOUNT_KOP),
  email: z.email(),
  monthly: z.boolean(),
});

export type TestPaymentInput = z.input<typeof testPaymentSchema>;

/** Starts a payment from the emulator's own page; returns the widget's URL. */
export async function startTestPayment(
  input: TestPaymentInput,
): Promise<{ url: string } | { error: "invalid" }> {
  const fake = await requireFakeCloudPayments();
  const parsed = testPaymentSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };

  const { amountKop, email, monthly } = parsed.data;
  const launch = fake.widgetParams({
    invoiceId: `test-${randomBytes(8).toString("hex")}`,
    amountKop,
    description: monthly
      ? "Тестовое ежемесячное пожертвование"
      : "Тестовое пожертвование",
    email,
    metadata: { target: "GENERAL" },
    ...(monthly && {
      // Opaque, as a real intent's should be: not the email.
      accountId: `test-payer-${randomBytes(8).toString("hex")}`,
      recurrent: { interval: "MONTH", period: 1 },
    }),
    returnUrl: `${getEnv().APP_URL}/fake-cloudpayments`,
  });
  if (launch.kind !== "redirect") notFound();
  return { url: launch.url };
}

const paySchema = z.object({
  checkoutId,
  outcome: z.enum(["success", "decline", "3ds"]),
  check: z.boolean(),
});

/** «Оплатить», «Отказ банка» or «3-D Secure» in the emulated widget. */
export async function payFakeCheckout(formData: FormData): Promise<void> {
  const fake = await requireFakeCloudPayments();
  const parsed = paySchema.safeParse({
    checkoutId: formData.get("checkoutId"),
    outcome: formData.get("outcome"),
    check: formData.get("check") === "on",
  });
  if (!parsed.success) notFound();

  const { checkoutId: id, outcome, check } = parsed.data;
  await fake.pay(id, { outcome, check });
  redirect(`${FAKE_CHECKOUT_PATH}/${id}`);
}

const threeDsSchema = z.object({
  checkoutId,
  result: z.enum(["passed", "failed"]),
});

/** The answer on the emulated 3-D Secure page. */
export async function completeFake3ds(formData: FormData): Promise<void> {
  const fake = await requireFakeCloudPayments();
  const parsed = threeDsSchema.safeParse({
    checkoutId: formData.get("checkoutId"),
    result: formData.get("result"),
  });
  if (!parsed.success) notFound();

  const { checkoutId: id, result } = parsed.data;
  await fake.complete3ds(id, result === "passed");
  redirect(`${FAKE_CHECKOUT_PATH}/${id}`);
}

/** The donor closed the widget without paying. */
export async function cancelFakeCheckout(formData: FormData): Promise<void> {
  const fake = await requireFakeCloudPayments();
  const parsed = checkoutId.safeParse(formData.get("checkoutId"));
  if (!parsed.success) notFound();

  fake.cancel(parsed.data);
  redirect(`${FAKE_CHECKOUT_PATH}/${parsed.data}`);
}

/** «Повторить платёж» after a decline. */
export async function retryFakeCheckout(formData: FormData): Promise<void> {
  const fake = await requireFakeCloudPayments();
  const parsed = checkoutId.safeParse(formData.get("checkoutId"));
  if (!parsed.success) notFound();

  fake.retry(parsed.data);
  redirect(`${FAKE_CHECKOUT_PATH}/${parsed.data}`);
}
