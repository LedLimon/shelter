import type { PaymentProvider } from "../types";
import { createCloudPaymentsApi, type CloudPaymentsApiConfig } from "./api";
import { SIGNATURE_HEADER, verifySignature } from "./signature";
import { parseWebhook } from "./webhooks";
import { cloudPaymentsWidgetParams } from "./widget";

export type CloudPaymentsConfig = CloudPaymentsApiConfig;

/** The CloudPayments adapter (ADR-0002). Formats: docs/payments.md#платёжный-слой. */
export function createCloudPayments(
  config: CloudPaymentsConfig,
): PaymentProvider {
  const api = createCloudPaymentsApi(config);
  return {
    name: "cloudpayments",
    widgetParams: (intent) =>
      cloudPaymentsWidgetParams(config.publicId, intent),
    verifyWebhook: ({ rawBody, headers }) =>
      verifySignature(rawBody, headers.get(SIGNATURE_HEADER), config.apiSecret),
    parseWebhook,
    ...api,
  };
}
