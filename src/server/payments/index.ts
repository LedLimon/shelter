import "server-only";
import { getEnv } from "@/lib/env";
import { createFakeState, type FakeState } from "./fake";
import { createPaymentProvider } from "./provider";
import type { PaymentProvider } from "./types";

export { PaymentProviderError, WebhookParseError } from "./errors";
export type * from "./types";
export { WEBHOOK_TYPES } from "./types";

const globalForPayments = globalThis as typeof globalThis & {
  shelterFakePayments?: FakeState;
};

let provider: PaymentProvider | undefined;

/**
 * The payment provider of this server process, chosen by PAYMENT_PROVIDER.
 * Created on first use, not on import: `next build` has no runtime variables.
 * The provider is cached per module, so dev reloads pick up code changes; the
 * fake's payments live on globalThis and survive them.
 */
export function getPaymentProvider(): PaymentProvider {
  if (!provider) {
    const env = getEnv();
    if (env.PAYMENT_PROVIDER === "fake") {
      globalForPayments.shelterFakePayments ??= createFakeState();
    }
    provider = createPaymentProvider(
      env,
      globalForPayments.shelterFakePayments,
    );
  }
  return provider;
}
