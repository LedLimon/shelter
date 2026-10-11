import type { FakeCheckout, FakeDelivery } from "@/server/payments/fake";

const NBSP = "\u00A0";

/** "HTTP 404", "HTTP 200, code 13" or that there was no answer at all. */
export function answerOf({ status, code }: FakeDelivery): string {
  if (status === null) return "сайт не ответил";
  const http = `HTTP${NBSP}${status}`;
  return code === null ? http : `${http}, code${NBSP}${code}`;
}

export type CheckoutOutcome = {
  /** What happened to the money and whether our site knows it. */
  tone: "success" | "warning" | "failure" | "neutral";
  title: string;
  text: string;
};

/**
 * The result screen of the emulated widget, or null while the donor still has
 * a choice to make. It reports two things that may differ: what the "bank"
 * did and whether our site took the notification about it — a paid payment
 * whose Pay our handler refused is not a success.
 */
export function outcomeOf(checkout: FakeCheckout): CheckoutOutcome | null {
  const last = checkout.deliveries.at(-1);
  const answer = last ? answerOf(last) : "сайт не ответил";

  switch (checkout.status) {
    case "open":
    case "awaiting-3ds":
      return null;
    case "processing":
      return {
        tone: "neutral",
        title: "Платёж обрабатывается",
        text: "Эмулятор ждёт ответа сайта на уведомление.",
      };
    case "cancelled":
      return {
        tone: "neutral",
        title: "Виджет закрыт без оплаты",
        // After «Повторить платёж» the log below holds the earlier attempt.
        text:
          checkout.deliveries.length === 0
            ? "Уведомления сайту не отправлялись."
            : "В последней попытке уведомления сайту не отправлялись.",
      };
    case "paid":
      return last?.accepted
        ? {
            tone: "success",
            title: "Оплата прошла",
            text: "Сайт принял уведомление Pay. Деньги не списывались: это эмулятор.",
          }
        : {
            tone: "warning",
            title: "Оплата прошла, но сайт её не записал",
            text: `Банк одобрил платёж, а сайт не принял уведомление Pay (${answer}). Пока оно не принято, пожертвования на сайте нет.`,
          };
    case "declined": {
      if (checkout.declineReason === "check") {
        return {
          tone: "failure",
          title: "Сайт не подтвердил платёж",
          text: `Ответ сайта на уведомление Check: ${answer}. Платёж проходит, только когда сайт разрешает его в этом ответе, — так же поступает CloudPayments. Проверьте обработчик Check или повторите платёж без галочки «Отправлять уведомление Check».`,
        };
      }
      const [title, reason] =
        checkout.declineReason === "3ds"
          ? [
              "3-D Secure не пройден",
              "код 5206: банк не подтвердил плательщика",
            ]
          : ["Банк отклонил платёж", "код 5051: на карте не хватило денег"];
      return last?.accepted
        ? {
            tone: "failure",
            title,
            text: `Сайт принял уведомление Fail (${reason}).`,
          }
        : {
            tone: "warning",
            title,
            text: `Эмулятор отправил уведомление Fail (${reason}). Сайт его не принял: ${answer}.`,
          };
    }
  }
}
