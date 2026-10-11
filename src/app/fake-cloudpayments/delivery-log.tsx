import { CircleCheck, CircleX } from "lucide-react";
import type { FakeDelivery } from "@/server/payments/fake";

const TITLE = {
  check: "Check",
  pay: "Pay",
  fail: "Fail",
  refund: "Refund",
  recurrent: "Recurrent",
} as const;

function answerOf({ status, code }: FakeDelivery): string {
  if (status === null) return "сайт не ответил";
  return code === null ? `HTTP ${status}` : `HTTP ${status}, code ${code}`;
}

/** What the emulator posted to our endpoint for this payment, and the answers. */
export function DeliveryLog({ deliveries }: { deliveries: FakeDelivery[] }) {
  if (deliveries.length === 0) return null;

  return (
    <section aria-labelledby="deliveries" className="flex flex-col gap-3">
      <h2 id="deliveries" className="font-display text-label uppercase">
        Уведомления сайту
      </h2>
      <ol className="flex flex-col gap-3">
        {deliveries.map((delivery, index) => {
          const { webhook, accepted } = delivery;
          const Icon = accepted ? CircleCheck : CircleX;
          return (
            <li
              key={index}
              className="flex flex-col gap-1.5 border border-perforation p-3"
            >
              <p className="flex items-start gap-2">
                <Icon
                  aria-hidden
                  className={
                    accepted
                      ? "mt-0.5 size-4 shrink-0"
                      : "mt-0.5 size-4 shrink-0 text-destructive"
                  }
                />
                <span>
                  <span className="font-display text-label uppercase">
                    {TITLE[webhook.type]}
                  </span>{" "}
                  — {accepted ? "принято" : "не принято"}: {answerOf(delivery)}
                </span>
              </p>
              {!accepted && webhook.type !== "check" && (
                <p className="text-caption text-toner-muted">
                  CloudPayments повторял&nbsp;бы такое уведомление до&nbsp;100
                  раз. Эмулятор не&nbsp;повторяет.
                </p>
              )}
              <details className="text-caption">
                <summary className="min-h-11 cursor-pointer content-center text-pen underline decoration-[1.5px] underline-offset-[3px]">
                  Запрос
                </summary>
                <pre className="overflow-x-auto border border-perforation bg-background p-3 font-mono text-mono [overflow-wrap:anywhere] whitespace-pre-wrap">
                  {`POST /api/webhooks/cloudpayments/${webhook.type}\n`}
                  {Object.entries(webhook.headers)
                    .map(([name, value]) => `${name}: ${value}`)
                    .join("\n")}
                  {`\n\n${webhook.body}`}
                </pre>
              </details>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
