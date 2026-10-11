import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isLocalUrl } from "@/lib/env/schema";
import { getPaymentProvider } from "@/server/payments";
import {
  isFakeCloudPayments,
  type FakeCloudPayments,
} from "@/server/payments/fake";

/** Whether the request was addressed to this machine, not to a public name. */
function isLocalHost(host: string | null): boolean {
  if (!host) return false;
  try {
    return isLocalUrl(`http://${host}`);
  } catch {
    return false;
  }
}

/**
 * The emulator, or a 404 when the site takes real payments. Call it first in
 * every page, metadata function and server action of /fake-cloudpayments:
 * each is reachable on its own.
 *
 * It also answers 404 to a request that came for a public host name. The
 * environment check already refuses the emulator on a public APP_URL; this
 * covers a server put behind a proxy with APP_URL left at localhost.
 */
export async function requireFakeCloudPayments(): Promise<FakeCloudPayments> {
  // Request time only: `next build` has no PAYMENT_PROVIDER to read.
  const requestHeaders = await headers();
  const provider = getPaymentProvider();
  if (!isFakeCloudPayments(provider)) notFound();

  const forwardedHost = requestHeaders.get("x-forwarded-host");
  if (
    !isLocalHost(requestHeaders.get("host")) ||
    (forwardedHost !== null && !isLocalHost(forwardedHost))
  ) {
    notFound();
  }
  return provider;
}
