import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { EmailContext } from "../context";
import type { EmailProps } from "../registry";
import { renderEmail } from "../render";
import { plain } from "../../../../tests/helpers/text";
import { donationThanks } from "./donation-thanks";

const context: EmailContext = {
  siteUrl: "https://mys.example",
  timeZone: "Europe/Moscow",
  shelter: { name: "Мыс доброй надежды", email: "priyut@mys.example" },
};

type Props = EmailProps<"donation.thanks">;
type NeedPurpose = Extract<Props["purpose"], { kind: "need" }>;

const base = {
  donationId: "cm2a8k3xw0001qz0h7v5t9e4b",
  amountKop: 150_000,
  // 23:30 UTC is already the next day in Moscow.
  paidAt: new Date("2026-10-11T23:30:00Z"),
} satisfies Partial<Props>;

const toNeed = (purpose: Partial<NeedPurpose> = {}): Props => ({
  ...base,
  purpose: {
    kind: "need",
    title: "Корм на октябрь",
    slug: "korm-na-oktyabr",
    overflowKop: 0,
    ...purpose,
  },
});

const toGeneral: Props = { ...base, purpose: { kind: "general" } };

/** The letter with plain spaces for the non-breaking ones: see plain(). */
async function render(props: Props, overrides: Partial<EmailContext> = {}) {
  const letter = await renderEmail("donation.thanks", props, {
    ...context,
    ...overrides,
  });
  return {
    ...letter,
    subject: plain(letter.subject),
    html: plain(letter.html),
    text: plain(letter.text),
  };
}

describe("donation.thanks", () => {
  it("names the amount in the subject, formatted by formatRub", async () => {
    const { subject } = await render(toNeed());

    expect(subject).toBe("Спасибо! Мы получили ваше пожертвование — 1 500 ₽");
  });

  it("keeps an amount on one line: its spaces are non-breaking", async () => {
    const { subject, text } = await renderEmail(
      "donation.thanks",
      toNeed(),
      context,
    );

    expect(subject).toContain("\u2014 1\u00A0500\u00A0\u20BD");
    expect(text).toContain("1\u00A0500\u00A0\u20BD");
  });

  it("thanks for a donation that went to the need in full", async () => {
    const { html, text } = await render(toNeed());

    expect(text).toContain(
      "Вся сумма пошла на сбор «Корм на октябрь» <https://mys.example/needs/korm-na-oktyabr>.",
    );
    expect(text).toContain("Сумма   1 500 ₽");
    expect(text).toContain("Куда    Сбор «Корм на октябрь»");
    expect(text).toContain(
      "Посмотреть сбор <https://mys.example/needs/korm-na-oktyabr>",
    );
    expect(text).not.toContain("общий фонд");
    expect(html).toContain('href="https://mys.example/needs/korm-na-oktyabr"');
  });

  it("explains the part that went past the goal into the general fund", async () => {
    const { text } = await render(
      toNeed({ overflowKop: 30_050, goalReached: true }),
    );

    expect(text).toContain("Оно закрыло сбор «Корм на октябрь»");
    expect(text).toContain("На этот сбор   1 199,50 ₽");
    expect(text).toContain("В общий фонд   300,50 ₽");
    expect(text).toContain(
      "До цели сбору не хватало 1 199,50 ₽, поэтому остальные 300,50 ₽ перешли в общий фонд приюта.",
    );
    expect(text).toContain("Общий фонд — это деньги на повседневные расходы");
    expect(text).toContain(
      "книге операций <https://mys.example/transparency/ledger>",
    );
  });

  it("explains a need that closed while the payment was on its way", async () => {
    const { text } = await render(toNeed({ overflowKop: 150_000 }));

    expect(text).toContain(
      "Пока шла оплата, сбор «Корм на октябрь» <https://mys.example/needs/korm-na-oktyabr> закрылся, поэтому вся сумма перешла в общий фонд приюта.",
    );
    expect(text).toContain("Куда    Общий фонд");
    expect(text).toContain(
      "Посмотреть расходы <https://mys.example/transparency>",
    );
    expect(text).not.toContain("не хватало");
  });

  it("thanks for a donation to the general fund", async () => {
    const { text } = await render(toGeneral);

    expect(text).toContain("Оно зачислено в общий фонд приюта.");
    expect(text).toContain("Куда    Общий фонд");
    expect(text).toContain(
      "Посмотреть расходы <https://mys.example/transparency>",
    );
    expect(text).not.toContain("сбор «");
  });

  it("says it is not a fiscal receipt and gives the donation's number", async () => {
    for (const props of [toNeed(), toNeed({ overflowKop: 1 }), toGeneral]) {
      const { text } = await render(props);

      expect(text).toContain(
        "Это письмо — подтверждение пожертвования, а не кассовый чек.",
      );
      expect(text).toContain("Номер пожертвования: cm2a8k3xw0001qz0h7v5t9e4b");
    }
  });

  it("tells that the donation completed the goal", async () => {
    const { text } = await render(toNeed({ goalReached: true }));

    expect(text).toContain("Оно закрыло сбор: нужная сумма собрана.");
  });

  it.each([
    [1, "Ваше пожертвование — первое в этом сборе."],
    [2, "уже 2 пожертвования."],
    [5, "уже 5 пожертвований."],
    [11, "уже 11 пожертвований."],
    [21, "уже 21 пожертвование."],
    [1_204, "уже 1 204 пожертвования."],
  ])("declines the count of donations: %i", async (donationsCount, phrase) => {
    const { text } = await render(toNeed({ donationsCount }));

    expect(text).toContain(phrase);
  });

  it("says nothing about the count when it isn't known", async () => {
    const { text } = await render(toNeed());

    expect(text).not.toContain("в этом сборе");
  });

  it("dates the donation in the shelter's time zone", async () => {
    expect((await render(toNeed())).text).toContain("Когда   12 октября 2026");
    expect(
      (await render(toNeed(), { timeZone: "America/New_York" })).text,
    ).toContain("Когда   11 октября 2026");
  });

  it("keeps kopecks and the largest amount on one line", async () => {
    const { subject, html } = await render({
      ...toGeneral,
      amountKop: 2_147_483_647,
    });

    expect(subject).toContain("21 474 836,47 ₽");
    expect(html).toContain("21 474 836,47 ₽");
  });

  it("escapes a title and encodes a slug it didn't write", async () => {
    const { html, text } = await render(
      toNeed({ title: '<b>Корм</b> & "вода"', slug: "корм/вода?x=1" }),
    );

    expect(html).toContain("&lt;b&gt;Корм&lt;/b&gt; &amp; &quot;вода&quot;");
    expect(html).not.toContain("<b>Корм</b>");
    expect(text).toContain('сбор «<b>Корм</b> & "вода"»');
    expect(html).toContain(
      'href="https://mys.example/needs/%D0%BA%D0%BE%D1%80%D0%BC%2F%D0%B2%D0%BE%D0%B4%D0%B0%3Fx%3D1"',
    );
  });

  it("offers a reply only when the shelter has an address to reply to", async () => {
    const withAddress = await render(toNeed());
    const without = await render(toNeed(), {
      shelter: { name: context.shelter.name },
    });

    expect(withAddress.text).toContain(
      "Если это были не вы, ответьте на это письмо.",
    );
    expect(withAddress.text).toContain("mys.example · priyut@mys.example");
    expect(without.text).not.toContain("ответьте на это письмо");
    expect(without.text).not.toContain("@");
  });

  it("has no links to manage a subscription: it is not a mailing", async () => {
    const letter = await render(toNeed());

    expect(letter.unsubscribeUrl).toBeUndefined();
    expect(letter.text).not.toContain("Отписаться");
  });

  it("reads as plain text from top to bottom", async () => {
    const { text } = await render(
      toNeed({ overflowKop: 30_000, goalReached: true }),
      { shelter: { ...context.shelter, legalName: "АНО «Мыс»" } },
    );

    expect(text).toMatchInlineSnapshot(`
      "Мыс доброй надежды


      СПАСИБО ЗА ПОМОЩЬ!

      Мы получили ваше пожертвование. Оно закрыло сбор «Корм на октябрь» <https://mys.example/needs/korm-na-oktyabr>: нужная сумма собрана.

      Сумма          1 500 ₽
      На этот сбор   1 200 ₽
      В общий фонд   300 ₽
      Когда          12 октября 2026

      До цели сбору не хватало 1 200 ₽, поэтому остальные 300 ₽ перешли в общий фонд приюта.

      Общий фонд — это деньги на повседневные расходы приюта, на срочные случаи и на то, чтобы добавить, если какому-то сбору не хватило. Каждое поступление и каждый расход записаны в книге операций <https://mys.example/transparency/ledger> на сайте.

      Посмотреть сбор <https://mys.example/needs/korm-na-oktyabr>

      Это письмо — подтверждение пожертвования, а не кассовый чек. Номер пожертвования: cm2a8k3xw0001qz0h7v5t9e4b — назовите его, если будете писать нам об этом платеже.

      Команда приюта «Мыс доброй надежды»

      Вы получили это письмо, потому что сделали пожертвование на сайте приюта «Мыс доброй надежды». Если это были не вы, ответьте на это письмо.

      Приют «Мыс доброй надежды» · АНО «Мыс»
      mys.example · priyut@mys.example"
    `);
  });

  describe("refuses props a handler got wrong", () => {
    const invalid: [string, Props][] = [
      ["a fractional amount", { ...toGeneral, amountKop: 1500.5 }],
      ["a zero amount", { ...toGeneral, amountKop: 0 }],
      ["an overflow above the amount", toNeed({ overflowKop: 150_001 })],
      ["a negative overflow", toNeed({ overflowKop: -1 })],
      ["an empty title", toNeed({ title: "  " })],
      ["a count of zero", toNeed({ donationsCount: 0 })],
    ];

    it.each(invalid)("%s", async (_name, props) => {
      await expect(render(props)).rejects.toBeInstanceOf(ZodError);
    });
  });

  it("has an example for every way the money can go", () => {
    expect(Object.keys(donationThanks.examples)).toEqual([
      "need",
      "split",
      "closed",
      "general",
    ]);
  });
});
