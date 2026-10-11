import { describe, expect, it } from "vitest";
import { typeset } from "./typography";

/** Shows the non-breaking spaces of `text` as `_`. */
const marked = (text: string) => typeset(text).replaceAll("\u00A0", "_");

describe("typeset", () => {
  it("keeps a short preposition with the word after it", () => {
    expect(marked("Отчёт появится на странице сбора в книге операций")).toBe(
      "Отчёт появится на_странице сбора в_книге операций",
    );
  });

  it("handles short words in a row", () => {
    expect(marked("случаи и на то, чтобы добавить")).toBe(
      "случаи и_на_то, чтобы добавить",
    );
    expect(marked("а не кассовый чек")).toBe("а_не_кассовый чек");
  });

  it("keeps a dash with the word before it", () => {
    expect(marked("Общий фонд — это деньги")).toBe("Общий фонд_— это деньги");
  });

  it("starts a sentence and a quote the same way", () => {
    expect(marked("В общий фонд")).toBe("В_общий фонд");
    expect(marked("сбор «На корм»")).toBe("сбор «На_корм»");
  });

  it("keeps the three-letter prepositions too", () => {
    expect(marked("Корм для щенков и лекарства при простуде")).toBe(
      "Корм для_щенков и_лекарства при_простуде",
    );
  });

  it("leaves longer words, word endings and single words alone", () => {
    expect(marked("это письмо уже пришло")).toBe("это письмо уже пришло");
    expect(marked("сумма собрана")).toBe("сумма собрана");
    expect(marked("в")).toBe("в");
    expect(marked("")).toBe("");
  });

  it("keeps the spaces that are already non-breaking", () => {
    expect(marked("не хватало 1\u00A0200\u00A0₽")).toBe("не_хватало 1_200_₽");
  });
});
