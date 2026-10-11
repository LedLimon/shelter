import { CircleCheck, CircleX } from "lucide-react";
import type { FakeDelivery } from "@/server/payments/fake";
import { answerOf } from "./outcome";

const TITLE = {
  check: "Check",
  pay: "Pay",
  fail: "Fail",
  refund: "Refund",
  recurrent: "Recurrent",
} as const;

const NBSP = "\u00A0";

/** What the emulator posted to our endpoint for this payment, and the answers. */
export function DeliveryLog({ deliveries }: { deliveries: FakeDelivery[] }) {
  if (deliveries.length === 0) return null;

  return (
    <section aria-labelledby="deliveries" className="flex flex-col gap-1">
      <h2 id="deliveries" className="font-display text-label uppercase">
        Уведомления сайту
      </h2>
      <ol className="flex flex-col divide-y divide-perforation">
        {deliveries.map((delivery, index) => {
          const { webhook, accepted } = delivery;
          const Icon = accepted ? CircleCheck : CircleX;
          const title = TITLE[webhook.type];
          return (
            <li key={index} className="flex flex-col gap-1.5 py-3">
              <p className="flex items-start gap-2">
                <Icon
                  aria-hidden
                  className={
                    accepted
                      ? "mt-1 size-4 shrink-0"
                      : "mt-1 size-4 shrink-0 text-destructive"
                  }
                />
                <span>
                  <span className="font-display text-label uppercase">
                    {title}
                  </span>
                  {`${NBSP}— ${accepted ? "принято" : "не принято"}: ${answerOf(delivery)}`}
                </span>
              </p>
              <p className="font-mono text-mono break-all text-toner-muted">
                POST {delivery.url}
              </p>
              {!accepted && webhook.type !== "check" && (
                <p className="text-caption text-toner-muted">
                  CloudPayments повторял&nbsp;бы такое уведомление до&nbsp;100
                  раз. Эмулятор не&nbsp;повторяет.
                </p>
              )}
              <details className="text-caption">
                <summary className="min-h-11 w-fit cursor-pointer content-center text-pen underline decoration-[1.5px] underline-offset-[3px]">
                  Запрос {title}
                </summary>
                <div className="flex flex-col gap-3 pb-1">
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 font-mono text-mono">
                    {[...new URLSearchParams(webhook.body)].map(
                      ([name, value]) => (
                        <div key={name} className="contents">
                          <dt className="text-toner-muted">{name}</dt>
                          <dd className="[overflow-wrap:anywhere]">{value}</dd>
                        </div>
                      ),
                    )}
                  </dl>
                  <p className="text-toner-muted">
                    Как отправлено: заголовки и&nbsp;тело, по&nbsp;которому
                    посчитана подпись.
                  </p>
                  <pre className="bg-background p-3 font-mono text-mono [overflow-wrap:anywhere] whitespace-pre-wrap">
                    {Object.entries(webhook.headers)
                      .map(([name, value]) => `${name}: ${value}`)
                      .join("\n")}
                    {`\n\n${webhook.body}`}
                  </pre>
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
