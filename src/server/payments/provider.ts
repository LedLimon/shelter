import type { ServerEnv } from "@/lib/env/schema";
import { createCloudPayments } from "./cloudpayments";
import { createFakeCloudPayments, type FakeState } from "./fake";
import type { PaymentProvider } from "./types";

type PaymentEnv = Pick<
  ServerEnv,
  | "PAYMENT_PROVIDER"
  | "APP_URL"
  | "CLOUDPAYMENTS_PUBLIC_ID"
  | "CLOUDPAYMENTS_API_SECRET"
>;

/**
 * The provider PAYMENT_PROVIDER names. Not `server-only`: the worker builds
 * its own (reconciliation). In the app use getPaymentProvider().
 */
export function createPaymentProvider(
  env: PaymentEnv,
  fakeState?: FakeState,
): PaymentProvider {
  switch (env.PAYMENT_PROVIDER) {
    case "cloudpayments": {
      const publicId = env.CLOUDPAYMENTS_PUBLIC_ID;
      const apiSecret = env.CLOUDPAYMENTS_API_SECRET;
      // The env schema requires both; this is for callers that bypass it.
      if (!publicId || !apiSecret) {
        throw new Error(
          "payments: PAYMENT_PROVIDER=cloudpayments needs CLOUDPAYMENTS_PUBLIC_ID and CLOUDPAYMENTS_API_SECRET",
        );
      }
      return createCloudPayments({ publicId, apiSecret });
    }
    case "fake":
      return createFakeCloudPayments({ appUrl: env.APP_URL, state: fakeState });
  }
}
