import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isLocalHost } from "@/lib/env/schema";
import { getPaymentProvider } from "@/server/payments";
import {
  isFakeCloudPayments,
  type FakeCloudPayments,
} from "@/server/payments/fake";

/**
 * The emulator, or a 404 when the site takes real payments. Call it first in
 * every page, metadata function and server action of /fake-cloudpayments:
 * each is reachable on its own.
 *
 * It also answers 404 to a request addressed to anything but this machine
 * (a public name, a LAN address). That is a seat belt, not the lock: the
 * environment check is what keeps the emulator off a public site. This only
 * stops a casual visitor if a server ends up behind a proxy with APP_URL
 * left at localhost — and a proxy that rewrites Host defeats it.
 */
export async function requireFakeCloudPayments(): Promise<FakeCloudPayments> {
  // Request time only: `next build` has no PAYMENT_PROVIDER to read.
  const requestHeaders = await headers();
  const provider = getPaymentProvider();
  if (!isFakeCloudPayments(provider)) notFound();

  const host = requestHeaders.get("host");
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  if (
    host === null ||
    !isLocalHost(host) ||
    (forwardedHost !== null && !isLocalHost(forwardedHost))
  ) {
    notFound();
  }
  return provider;
}
