import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AA_TEXT, contrastRatio } from "@/lib/contrast";
import { DARK, LIGHT, type EmailColor, type EmailPalette } from "./palette";
import { stylesheet } from "./theme";

const css = readFileSync(
  new URL("../../app/globals.css", import.meta.url),
  "utf8",
);

/** `--color-*` declarations of the rule that starts with `selector {`. */
function tokens(selector: string): Map<string, string> {
  const start = css.indexOf(`\n${selector} {\n`);
  if (start === -1) throw new Error(`No "${selector}" rule in globals.css`);
  const body = css.slice(start, css.indexOf("\n}\n", start));
  return new Map(
    [...body.matchAll(/^\s*--color-([\w-]+):\s*([^;]+);/gm)].map(
      ([, name, value]) => [name ?? "", (value ?? "").trim().toLowerCase()],
    ),
  );
}

const site: Record<"light" | "dark", Map<string, string>> = {
  light: tokens("@theme static"),
  dark: tokens(".dark"),
};

describe.each([
  ["light", LIGHT],
  ["dark", DARK],
] as const)("the %s palette of the letters", (theme, palette: EmailPalette) => {
  it("is the site's tokens, value for value", () => {
    for (const [name, value] of Object.entries(palette)) {
      expect(value, name).toBe(site[theme].get(name));
    }
  });

  // What a letter puts on what: text on the sheet and on the board, the
  // button's label on its toner block.
  it.each<[EmailColor, EmailColor]>([
    ["toner", "paper"],
    ["toner-muted", "paper"],
    ["pen", "paper"],
    ["toner-muted", "board"],
    ["pen", "board"],
    ["paper", "toner"],
  ])("%s on %s passes WCAG AA", (foreground, background) => {
    expect(
      contrastRatio(palette[foreground], palette[background]),
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe("stylesheet", () => {
  it("repaints every role of every colour for a dark mail client", () => {
    const sheet = stylesheet();
    for (const [name, value] of Object.entries(DARK)) {
      expect(sheet).toContain(
        `.bg-${name}{background-color:${value}!important}`,
      );
      expect(sheet).toContain(`.fg-${name}{color:${value}!important}`);
      expect(sheet).toContain(
        `.border-${name}{border-color:${value}!important}`,
      );
    }
  });
});
