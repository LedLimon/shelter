import "server-only";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getPaymentProvider } from "@/server/payments";
import {
  isFakeCloudPayments,
  type FakeCloudPayments,
} from "@/server/payments/fake";

/**
 * The emulator, or a 404 when the site takes real payments. Call it first in
 * every page, metadata function and server action of /fake-cloudpayments:
 * each is reachable on its own.
 */
export async function requireFakeCloudPayments(): Promise<FakeCloudPayments> {
  // Request time only: `next build` has no PAYMENT_PROVIDER to read.
  await connection();
  const provider = getPaymentProvider();
  if (!isFakeCloudPayments(provider)) notFound();
  return provider;
}
