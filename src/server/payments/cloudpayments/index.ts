import { WebhookSignatureError } from "../errors";
import type { PaymentProvider } from "../types";
import { createCloudPaymentsApi, type CloudPaymentsApiConfig } from "./api";
import { SIGNATURE_HEADER, verifySignature } from "./signature";
import { parseWebhook, webhookResponse } from "./webhooks";
import { cloudPaymentsWidgetParams } from "./widget";

/**
 * `acceptTestPayments` — the terminal is a test one (staging): its payments
 * are what we expect. Off in production, where a test payment must never be
 * taken for money.
 */
export type CloudPaymentsConfig = CloudPaymentsApiConfig;

type Webhooks = Pick<
  PaymentProvider,
  | "acceptsTestPayments"
  | "receiveWebhook"
  | "parseStoredWebhook"
  | "webhookResponse"
>;

/**
 * Receiving CloudPayments' notifications: signature first, then the body.
 * The emulator uses it as it is, with its own secret.
 */
export function cloudPaymentsWebhooks(config: {
  apiSecret: string;
  acceptTestPayments: boolean;
}): Webhooks {
  const { apiSecret, acceptTestPayments } = config;
  const policy = { acceptTestPayments };
  return {
    acceptsTestPayments: acceptTestPayments,
    receiveWebhook(type, { rawBody, headers }) {
      const signature = headers.get(SIGNATURE_HEADER);
      if (!verifySignature(rawBody, signature, apiSecret)) {
        throw new WebhookSignatureError();
      }
      return parseWebhook(type, rawBody, policy);
    },
    parseStoredWebhook: (type, rawBody) => parseWebhook(type, rawBody, policy),
    webhookResponse,
  };
}

/** The CloudPayments adapter (ADR-0002). Formats: docs/payments.md#платёжный-слой. */
export function createCloudPayments(
  config: CloudPaymentsConfig,
): PaymentProvider {
  return {
    name: "cloudpayments",
    widgetParams: (intent) =>
      cloudPaymentsWidgetParams(config.publicId, intent),
    ...cloudPaymentsWebhooks(config),
    ...createCloudPaymentsApi(config),
  };
}
