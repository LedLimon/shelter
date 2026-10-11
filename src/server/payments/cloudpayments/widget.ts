import { kopToDecimalRub } from "@/lib/money";
import { assertPaymentIntent } from "../intent";
import type {
  CloudPaymentsWidgetOptions,
  PaymentIntent,
  WidgetParams,
} from "../types";

// Checked against developers.cloudpayments.ru («Платёжный виджет») on
// 2026-10-11: the widget is started with `new cp.CloudPayments().start(…)`.
export const WIDGET_SCRIPT_URL =
  "https://widget.cloudpayments.ru/bundles/cloudpayments.js";

/** The widget takes rubles as a number; kopecks stay integers on our side. */
function rubles(kop: number): number {
  return Number(kopToDecimalRub(kop));
}

export function cloudPaymentsWidgetParams(
  publicId: string,
  intent: PaymentIntent,
): WidgetParams {
  assertPaymentIntent(intent);

  const options: CloudPaymentsWidgetOptions = {
    publicTerminalId: publicId,
    amount: rubles(intent.amountKop),
    currency: "RUB",
    paymentSchema: "Single",
    culture: "ru-RU",
    description: intent.description,
    externalId: intent.invoiceId,
    userInfo: {
      email: intent.email,
      ...(intent.accountId && { accountId: intent.accountId }),
    },
    metadata: intent.metadata,
    ...(intent.recurrent && {
      recurrent: {
        interval: "Month",
        period: intent.recurrent.period,
        ...(intent.recurrent.amountKop !== undefined && {
          amount: rubles(intent.recurrent.amountKop),
        }),
      },
    }),
    successRedirectUrl: intent.returnUrl,
    failRedirectUrl: intent.returnUrl,
  };
  return { kind: "cloudpayments", scriptUrl: WIDGET_SCRIPT_URL, options };
}
