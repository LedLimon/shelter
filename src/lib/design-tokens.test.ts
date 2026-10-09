import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { contrastRatio, formatRatio } from "@/lib/contrast";
import {
  COLOR_TOKENS,
  CONTRAST_PAIRS,
  KNOWN_LOW_CONTRAST_PAIRS,
  type ColorToken,
} from "@/lib/design-tokens";

const css = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);
const designDoc = readFileSync(
  new URL("../../docs/design.md", import.meta.url),
  "utf8",
);

type Theme = "light" | "dark";
const THEMES: Theme[] = ["light", "dark"];

/** Body of the first rule that starts with `selector {` at the start of a line. */
function ruleBody(selector: string): string {
  const start = css.indexOf(`\n${selector} {\n`);
  if (start === -1) throw new Error(`No "${selector}" rule in globals.css`);
  const end = css.indexOf("\n}\n", start);
  return css.slice(start, end);
}

function colorDeclarations(body: string): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const [, name, value] of body.matchAll(
    /^\s*--color-([\w-]+):\s*([^;]+);/gm,
  )) {
    if (name && value) declarations.set(name, value.trim());
  }
  return declarations;
}

const light = colorDeclarations(ruleBody("@theme static"));
const dark = new Map([...light, ...colorDeclarations(ruleBody(".dark"))]);

function tokenValue(theme: Theme, token: string, seen: string[] = []): string {
  const declarations = theme === "light" ? light : dark;
  const value = declarations.get(token);
  if (!value) throw new Error(`--color-${token} is not defined (${theme})`);
  const reference = /^var\(--color-([\w-]+)\)$/.exec(value)?.[1];
  if (!reference) return value.toLowerCase();
  if (seen.includes(reference)) throw new Error(`Cycle at --color-${token}`);
  return tokenValue(theme, reference, [...seen, token]);
}

/** The two ratios of a contrast table row in docs/design.md. */
function documentedRatios(label: string): [string, string] {
  const row = designDoc
    .split("\n")
    .find((line) => line.startsWith(`| ${label} `));
  const ratios = row?.match(/\d+,\d{2}:1/g);
  if (!ratios || ratios.length < 2) {
    throw new Error(`No contrast row «${label}» in docs/design.md`);
  }
  return [ratios[0], ratios[1]] as [string, string];
}

describe("colour tokens", () => {
  it("defines every token as a hex colour or a reference in both themes", () => {
    for (const theme of THEMES) {
      for (const token of COLOR_TOKENS) {
        expect(tokenValue(theme, token)).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("defines nothing besides the listed tokens", () => {
    expect([...light.keys()].sort()).toEqual([...COLOR_TOKENS].sort());
    expect([...dark.keys()].sort()).toEqual([...COLOR_TOKENS].sort());
  });

  it("matches the palette tables in docs/design.md", () => {
    const documented = new Map<string, [string, string]>();
    for (const [, token, lightHex, darkHex] of designDoc.matchAll(
      /^\|[^\n]*`--color-([\w-]+)`[^\n]*?`(#[0-9A-Fa-f]{6})`[^\n]*?`(#[0-9A-Fa-f]{6})`/gm,
    )) {
      if (token && lightHex && darkHex) {
        documented.set(token, [lightHex.toLowerCase(), darkHex.toLowerCase()]);
      }
    }
    expect([...documented.keys()].sort()).toEqual([...COLOR_TOKENS].sort());
    for (const token of COLOR_TOKENS) {
      expect([tokenValue("light", token), tokenValue("dark", token)]).toEqual(
        documented.get(token),
      );
    }
  });
});

describe("contrast (WCAG 2.1 AA)", () => {
  const ratio = (
    theme: Theme,
    foreground: ColorToken,
    background: ColorToken,
  ) =>
    contrastRatio(tokenValue(theme, foreground), tokenValue(theme, background));

  it.each(CONTRAST_PAIRS)(
    "$label: ≥ $min:1 in both themes",
    ({ foreground, background, min }) => {
      for (const theme of THEMES) {
        expect(ratio(theme, foreground, background)).toBeGreaterThanOrEqual(
          min,
        );
      }
    },
  );

  it.each([...CONTRAST_PAIRS, ...KNOWN_LOW_CONTRAST_PAIRS])(
    "$label: docs/design.md shows the actual ratios",
    ({ label, foreground, background }) => {
      expect(documentedRatios(label)).toEqual([
        formatRatio(ratio("light", foreground, background)),
        formatRatio(ratio("dark", foreground, background)),
      ]);
    },
  );
});
