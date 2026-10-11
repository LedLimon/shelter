import { describe, expect, it } from "vitest";
import { parseLegalInline, parseLegalText } from "./parse-legal-text";

describe("parseLegalText", () => {
  it("reads headings, lists and paragraphs line by line", () => {
    const body = [
      "## 1. Общие положения",
      "1.1. Настоящая оферта — предложение заключить договор.",
      "1.2. Пожертвование является целевым.",
      "",
      "### Что входит",
      "- корм;",
      "— лекарства;",
      "• работа мастеров.",
      "Последний абзац.",
    ].join("\n");

    expect(parseLegalText(body)).toEqual([
      { kind: "heading", level: 2, text: "1. Общие положения" },
      {
        kind: "paragraph",
        text: "1.1. Настоящая оферта — предложение заключить договор.",
      },
      { kind: "paragraph", text: "1.2. Пожертвование является целевым." },
      { kind: "heading", level: 3, text: "Что входит" },
      { kind: "list", items: ["корм;", "лекарства;", "работа мастеров."] },
      { kind: "paragraph", text: "Последний абзац." },
    ]);
  });

  it("keeps clause numbers as typed: a numbered line is a paragraph", () => {
    expect(parseLegalText("1. Первый\n2. Второй")).toEqual([
      { kind: "paragraph", text: "1. Первый" },
      { kind: "paragraph", text: "2. Второй" },
    ]);
  });

  it("takes a single # for a section heading: the page has its own h1", () => {
    expect(parseLegalText("# Раздел")).toEqual([
      { kind: "heading", level: 2, text: "Раздел" },
    ]);
  });

  it("leaves a dash inside a line and a mark without text alone", () => {
    expect(parseLegalText("Приют — это дом\n#хэштег\n-5 градусов")).toEqual([
      { kind: "paragraph", text: "Приют — это дом" },
      { kind: "paragraph", text: "#хэштег" },
      { kind: "paragraph", text: "-5 градусов" },
    ]);
  });

  it("starts a new list after a paragraph in between", () => {
    expect(parseLegalText("- а\nтекст\n- б")).toEqual([
      { kind: "list", items: ["а"] },
      { kind: "paragraph", text: "текст" },
      { kind: "list", items: ["б"] },
    ]);
  });

  it("gives nothing for an empty text and reads Windows line ends", () => {
    expect(parseLegalText(" \n\n")).toEqual([]);
    expect(parseLegalText("а\r\nб")).toEqual([
      { kind: "paragraph", text: "а" },
      { kind: "paragraph", text: "б" },
    ]);
  });
});

describe("parseLegalInline", () => {
  it("finds web addresses and leaves the sentence's punctuation outside", () => {
    expect(
      parseLegalInline(
        "Политика: https://priyut.example/legal/privacy. Вопросы — на почту.",
      ),
    ).toEqual([
      { kind: "text", text: "Политика: " },
      { kind: "link", href: "https://priyut.example/legal/privacy" },
      { kind: "text", text: ". Вопросы — на почту." },
    ]);
    expect(parseLegalInline("(см. https://example.ru/a?b=1)")).toEqual([
      { kind: "text", text: "(см. " },
      { kind: "link", href: "https://example.ru/a?b=1" },
      { kind: "text", text: ")" },
    ]);
  });

  it("links nothing that is not an http(s) address", () => {
    for (const text of [
      "javascript:alert(1)",
      "почта priyut@example.ru",
      "https://",
      "",
    ]) {
      expect(
        parseLegalInline(text).filter(({ kind }) => kind === "link"),
      ).toEqual([]);
    }
  });
});
