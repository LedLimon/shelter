import "server-only";
import { getEnv } from "@/lib/env";
import { createPaymentProvider } from "./provider";
import type { PaymentProvider } from "./types";

export {
  PaymentProviderError,
  WebhookParseError,
  WebhookSignatureError,
} from "./errors";
export type * from "./types";
export { WEBHOOK_TYPES } from "./types";

let provider: PaymentProvider | undefined;

/**
 * The payment provider of this server process, chosen by PAYMENT_PROVIDER.
 * Created on first use, not on import: `next build` has no runtime variables.
 * Cached per module, so dev reloads pick up code changes; the emulator's
 * payments live on globalThis and survive them.
 */
export function getPaymentProvider(): PaymentProvider {
  provider ??= createPaymentProvider(getEnv());
  return provider;
}
