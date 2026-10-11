import { render, toPlainText } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { plain } from "../../../tests/helpers/text";
import { Text } from "./components";
import type { EmailContext } from "./context";
import { EmailLayout, type EmailLinks } from "./layout";

const context: EmailContext = {
  siteUrl: "https://mys.example",
  timeZone: "Europe/Moscow",
  shelter: { name: "Мыс доброй надежды" },
};

/** With plain spaces for the non-breaking ones: see plain(). */
const letter = async (links?: EmailLinks, siteUrl = context.siteUrl) =>
  plain(
    await render(
      <EmailLayout
        context={{ ...context, siteUrl }}
        title="Отчёт за октябрь"
        preview="Что купили и сколько осталось."
        reason="Вы получили это письмо, потому что подписались на отчёты приюта."
        links={links}
      >
        <Text>Здравствуйте!</Text>
      </EmailLayout>,
    ),
  );

describe("EmailLayout", () => {
  it("has no subscription links unless the letter brings them", async () => {
    const html = await letter();

    expect(html).not.toContain("Управлять подпиской");
    expect(html).not.toContain("Отписаться");
  });

  it("offers to manage the subscription and to leave the mailing list", async () => {
    const html = await letter({
      manage: "https://mys.example/subscriptions/manage?token=m",
      unsubscribe: "https://mys.example/unsubscribe?token=u",
    });

    expect(html).toMatch(
      /<a href="https:\/\/mys\.example\/subscriptions\/manage\?token=m"[^>]*>Управлять подпиской<\/a>/,
    );
    expect(html).toMatch(
      /<a href="https:\/\/mys\.example\/unsubscribe\?token=u"[^>]*>Отписаться от рассылки<\/a>/,
    );
    expect(toPlainText(html)).toContain("Управлять подпиской");
  });

  it("shows either link alone, without a stray separator", async () => {
    const text = toPlainText(
      await letter({ unsubscribe: "https://mys.example/unsubscribe?token=u" }),
    );

    expect(text).toContain("Отписаться от рассылки");
    expect(text).not.toContain("Управлять подпиской");
    expect(text).not.toMatch(/·\s*Отписаться|Отписаться[^\n]*·/);
  });

  it("writes a Cyrillic domain as people read it, and a port when there is one", async () => {
    // However APP_URL spells it: URL turns a Cyrillic host into punycode.
    for (const url of [
      "https://приют-мыс.рф",
      "https://xn----otbnjfje8exa.xn--p1ai",
    ]) {
      expect(await letter(undefined, url)).toContain(">приют-мыс.рф</a>");
    }
    expect(await letter(undefined, "http://localhost:3000")).toContain(
      ">localhost:3000</a>",
    );
  });

  it("says why the reader got the letter and whose it is", async () => {
    const text = toPlainText(await letter());

    expect(text).toContain(
      "Вы получили это письмо, потому что подписались на отчёты приюта.",
    );
    expect(text).toContain("Приют «Мыс доброй надежды»");
  });
});
