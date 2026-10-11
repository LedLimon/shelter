import { describe, expect, it } from "vitest";
import { SHELTER_NAME } from "@/lib/shelter";
import type { EmailContext } from "./context";
import { emails, isEmailType, type EmailType } from "./registry";
import { renderEmail } from "./render";
import { DARK_MEDIA } from "./theme";

const context: EmailContext = {
  siteUrl: "https://mys.example",
  timeZone: "Europe/Moscow",
  shelter: {
    name: SHELTER_NAME,
    legalName: "АНО «Мыс доброй надежды»",
    email: "priyut@mys.example",
  },
};

/** Every example of every letter: what the preview and «email.test» send. */
const samples = (Object.keys(emails) as EmailType[]).flatMap((type) =>
  Object.entries(emails[type].examples).map(
    ([example, { props }]) => [type, example, props] as const,
  ),
);

describe.each(samples)("%s, example «%s»", (type, _example, props) => {
  const letter = () => renderEmail(type, props, context);

  it("is a whole HTML document in Russian", async () => {
    const { html, subject } = await letter();

    expect(html).toMatch(/^<!DOCTYPE html PUBLIC "-\/\/W3C\/\/DTD XHTML 1\.0/);
    expect(html).toContain('<html lang="ru" dir="ltr">');
    expect(html).toContain('content="text/html; charset=UTF-8"');
    expect(html).toContain(`<title>${subject}</title>`);
    expect(html.trimEnd()).toMatch(/<\/html>$/);
  });

  it("keeps Cyrillic as text, not as entities or mojibake", async () => {
    const { html, text, subject } = await letter();

    expect(subject).toMatch(/[а-яё]/i);
    expect(html).toContain(">Спасибо за помощь!<");
    // No numeric entities at all: quotes and Cyrillic alike stay literal.
    expect(html).not.toMatch(/&#x?[0-9a-f]+;/i);
    expect(html).not.toMatch(/Ð|Ñ|�/);
    expect(text).toMatch(/[а-яё]{4,}/i);
  });

  it("leaves no hole where a value should be", async () => {
    const { html, text, subject } = await letter();

    for (const part of [subject, html, text]) {
      expect(part).not.toMatch(/undefined|null|NaN|\[object/);
    }
  });

  it("signs with the shelter's name, written in one place", async () => {
    const { html, text } = await letter();

    expect(text).toContain(`Команда приюта «${SHELTER_NAME}»`);
    expect(text).toContain(
      `Приют «${SHELTER_NAME}» · АНО «Мыс доброй надежды»`,
    );
    // The masthead links the name to the site.
    expect(html).toMatch(
      new RegExp(`<a href="https://mys\\.example"[^>]*>${SHELTER_NAME}</a>`),
    );
  });

  it("carries the light theme inline and the dark one in the stylesheet", async () => {
    const { html } = await letter();

    expect(html).toContain('<meta name="color-scheme" content="light dark"/>');
    expect(html).toContain(`${DARK_MEDIA}{.bg-board{`);
    // The sheet: paper on the board, readable where <style> is dropped.
    expect(html).toMatch(
      /<body class="bg-board" style="[^"]*background-color:#d1d5d6/,
    );
    expect(html).toMatch(
      /class="bg-paper inset" style="[^"]*background-color:#fbfbf7/,
    );
  });

  it("hides the preheader in the letter and leaves it out of the text", async () => {
    const { html, text } = await letter();
    const preheader = /<div data-skip-in-text="true"[^>]*>([^<]+)/.exec(
      html,
    )?.[1];

    expect(preheader).toMatch(/[а-яё]/i);
    expect(text.startsWith(SHELTER_NAME)).toBe(true);
  });

  it("links only to the site and the shelter's mailbox", async () => {
    const { html } = await letter();
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(([, href]) => href);

    expect(hrefs.length).toBeGreaterThan(2);
    for (const href of hrefs) {
      expect(href).toMatch(
        /^(https:\/\/mys\.example(\/|$)|mailto:priyut@mys\.example$)/,
      );
    }
  });

  it("has a plain-text part that says the same", async () => {
    const { text } = await letter();

    expect(text).toContain("СПАСИБО ЗА ПОМОЩЬ!");
    expect(text).not.toMatch(/<\/?(p|td|table|a|span)\b/);
  });
});

describe("the registry", () => {
  it("knows its own keys and nothing inherited", () => {
    expect(isEmailType("donation.thanks")).toBe(true);
    expect(isEmailType("toString")).toBe(false);
    expect(isEmailType("")).toBe(false);
  });
});
