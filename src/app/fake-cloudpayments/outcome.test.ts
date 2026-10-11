import { describe, expect, it } from "vitest";
import type {
  FakeCheckout,
  FakeDelivery,
  FakeDeclineReason,
} from "@/server/payments/fake";
import { answerOf, outcomeOf } from "./outcome";

const NBSP = "\u00A0";

function delivery(
  type: FakeDelivery["webhook"]["type"],
  status: number | null,
  code: number | null,
): FakeDelivery {
  return {
    webhook: {
      type,
      body: "",
      headers: {
        "Content-Type": "",
        "Content-HMAC": "",
        "X-Content-HMAC": "",
      },
    },
    url: `http://localhost:3000/api/webhooks/cloudpayments/${type}`,
    status,
    code,
    accepted: status === 200 && code === 0,
  };
}

function checkout(
  status: FakeCheckout["status"],
  deliveries: FakeDelivery[] = [],
  declineReason: FakeDeclineReason | null = null,
): FakeCheckout {
  return {
    id: "checkout-1",
    intent: {
      invoiceId: "invoice-1",
      amountKop: 50_000,
      description: "Пожертвование",
      email: "donor@shelter.localhost",
      metadata: {},
      returnUrl: "http://localhost:3000/",
    },
    status,
    declineReason,
    transactionId: "179171014212300",
    chargedAt: new Date("2026-10-11T09:15:42Z"),
    subscriptionId: null,
    deliveries,
  };
}

describe("answerOf", () => {
  it.each([
    [200, 0, `HTTP${NBSP}200, code${NBSP}0`],
    [200, 13, `HTTP${NBSP}200, code${NBSP}13`],
    [404, null, `HTTP${NBSP}404`],
    [null, null, "сайт не ответил"],
  ])("%s / %s → %s", (status, code, expected) => {
    expect(answerOf(delivery("pay", status, code))).toBe(expected);
  });
});

describe("outcomeOf", () => {
  it("has nothing to report while the donor is choosing", () => {
    expect(outcomeOf(checkout("open"))).toBeNull();
    expect(
      outcomeOf(checkout("awaiting-3ds", [delivery("check", 200, 0)])),
    ).toBeNull();
  });

  it("is a success only when our site took the Pay", () => {
    expect(
      outcomeOf(
        checkout("paid", [delivery("check", 200, 0), delivery("pay", 200, 0)]),
      ),
    ).toMatchObject({ tone: "success", title: "Оплата прошла" });
  });

  // The bank said yes — and our handler lost the notification: not a success.
  it.each([
    [404, null, `HTTP${NBSP}404`],
    [500, null, `HTTP${NBSP}500`],
    [200, 13, `HTTP${NBSP}200, code${NBSP}13`],
    [401, null, `HTTP${NBSP}401`],
    [null, null, "сайт не ответил"],
  ])("warns when the Pay got %s / %s", (status, code, answer) => {
    const outcome = outcomeOf(
      checkout("paid", [delivery("pay", status, code)]),
    );

    expect(outcome).toMatchObject({
      tone: "warning",
      title: "Оплата прошла, но сайт её не записал",
    });
    expect(outcome?.text).toContain(`уведомление Pay (${answer})`);
  });

  it("names the reason of a decline and whether our site took the Fail", () => {
    const bank = outcomeOf(
      checkout("declined", [delivery("fail", 200, 0)], "bank"),
    );
    const threeDs = outcomeOf(
      checkout("declined", [delivery("fail", 200, 0)], "3ds"),
    );
    const lost = outcomeOf(
      checkout("declined", [delivery("fail", 500, null)], "bank"),
    );

    expect(bank).toMatchObject({
      tone: "failure",
      title: "Банк отклонил платёж",
    });
    expect(bank?.text).toContain("5051");
    expect(threeDs).toMatchObject({
      tone: "failure",
      title: "3-D Secure не пройден",
    });
    expect(threeDs?.text).toContain("5206");
    expect(lost).toMatchObject({
      tone: "warning",
      title: "Банк отклонил платёж",
    });
    expect(lost?.text).toContain(`сайт его не принял (HTTP${NBSP}500)`);
  });

  it("says what our Check answered and what to do about it", () => {
    const outcome = outcomeOf(
      checkout("declined", [delivery("check", 200, 10)], "check"),
    );

    expect(outcome).toMatchObject({
      tone: "failure",
      title: "Сайт не подтвердил платёж",
    });
    expect(outcome?.text).toContain(`HTTP${NBSP}200, code${NBSP}10`);
    expect(outcome?.text).toContain("снимите галочку");
  });

  it("reports a closed widget and a payment in progress", () => {
    expect(outcomeOf(checkout("cancelled"))).toMatchObject({
      tone: "neutral",
      title: "Виджет закрыт без оплаты",
    });
    expect(outcomeOf(checkout("processing"))).toMatchObject({
      tone: "neutral",
      title: "Платёж обрабатывается",
    });
  });
});
