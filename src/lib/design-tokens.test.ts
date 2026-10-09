import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { AA_TEXT, AA_UI, contrastRatio, formatRatio } from "@/lib/contrast";
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
// Root DESIGN.md: Impeccable's copy of the tokens in its YAML frontmatter.
const designSystem = readFileSync(
  new URL("../../DESIGN.md", import.meta.url),
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

/** A token's value as computed on <html> in the given theme. */
function tokenValue(theme: Theme, token: string): string {
  return resolve(theme === "light" ? light : dark, token);
}

/** Resolves `var(--color-…)` references within one set of declarations. */
function resolve(
  declarations: Map<string, string>,
  token: string,
  seen: string[] = [],
): string {
  const value = declarations.get(token);
  if (!value) throw new Error(`--color-${token} is not defined`);
  const reference = /^var\(--color-([\w-]+)\)$/.exec(value)?.[1];
  if (!reference) return value.toLowerCase();
  if (seen.includes(reference)) throw new Error(`Cycle at --color-${token}`);
  return resolve(declarations, reference, [...seen, token]);
}

const SURFACES = ["notice", "footer"] as const;
type Context = "page" | (typeof SURFACES)[number];

/**
 * Palette as an element sees it: the page's values computed on <html>, and on
 * a surface the utility's overrides resolved on the surface element.
 */
function palette(theme: Theme, context: Context): Map<string, string> {
  const page = new Map(
    COLOR_TOKENS.map((token) => [token, tokenValue(theme, token)]),
  );
  if (context === "page") return page;
  const onSurface = new Map([
    ...page,
    ...colorDeclarations(ruleBody(`@utility surface-${context}`)),
  ]);
  return new Map(
    COLOR_TOKENS.map((token) => [token, resolve(onSurface, token)]),
  );
}

// shadcn/ui variables, recomputed on <html> and on each surface.
const shadcnBody = ruleBody(":root,\n.surface-notice,\n.surface-footer");
const shadcnVariables = new Map(
  [...shadcnBody.matchAll(/^\s*--([\w-]+):\s*([^;]+);/gm)].map(
    ([, name, value]) => [name ?? "", value?.trim() ?? ""],
  ),
);

function shadcnValue(theme: Theme, context: Context, name: string): string {
  const token = /^var\(--color-([\w-]+)\)$/.exec(
    shadcnVariables.get(name) ?? "",
  )?.[1];
  if (!token) throw new Error(`--${name} does not point to a colour token`);
  return resolve(palette(theme, context), token);
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

  it("keeps dark values and shadcn variables on the palette (no `shadcn add` drift)", () => {
    const declarations = (body: string) =>
      [...body.matchAll(/^\s*(--[\w-]+|[a-z-]+):\s*([^;]+);/gm)].map(
        ([, name, value]) => `${name}: ${value}`,
      );
    expect(
      declarations(ruleBody(".dark")).filter(
        (line) => !/^(--color-[\w-]+|color-scheme):/.test(line),
      ),
    ).toEqual([]);
    expect(declarations(ruleBody(":root"))).toEqual([
      "color-scheme: light",
      "--radius: 0rem",
    ]);
    expect(
      declarations(shadcnBody).filter(
        (line) => !/^--[\w-]+: var\(--color-[\w-]+\)$/.test(line),
      ),
    ).toEqual([]);
  });

  it("matches the DESIGN.md frontmatter (`-dark` keys for the dark theme)", () => {
    const frontmatter = designSystem.split("\n---\n")[0] ?? "";
    const documented = new Map(
      [...frontmatter.matchAll(/^ {2}([\w-]+): "(#[0-9A-Fa-f]{6})"$/gm)].map(
        ([, key, hex]) => [key, hex?.toLowerCase()],
      ),
    );
    for (const token of COLOR_TOKENS) {
      expect([documented.get(token), documented.get(`${token}-dark`)]).toEqual([
        tokenValue("light", token),
        tokenValue("dark", token),
      ]);
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

  // shadcn/ui text and UI pairs on the page and inside both surfaces.
  const SHADCN_PAIRS: [string, string, number][] = [
    ["foreground", "background", AA_TEXT],
    ["card-foreground", "card", AA_TEXT],
    ["popover-foreground", "popover", AA_TEXT],
    ["primary-foreground", "primary", AA_TEXT],
    ["secondary-foreground", "secondary", AA_TEXT],
    ["muted-foreground", "muted", AA_TEXT],
    ["muted-foreground", "card", AA_TEXT],
    ["accent-foreground", "accent", AA_TEXT],
    ["destructive", "card", AA_TEXT],
    ["destructive", "background", AA_TEXT],
    ["sidebar-foreground", "sidebar", AA_TEXT],
    ["sidebar-primary-foreground", "sidebar-primary", AA_TEXT],
    ["sidebar-accent-foreground", "sidebar-accent", AA_TEXT],
    ["ring", "background", AA_UI],
    ["ring", "card", AA_UI],
    ["input", "card", AA_UI],
    ["sidebar-ring", "sidebar", AA_UI],
    ["chart-1", "card", AA_UI],
    ["chart-2", "card", AA_UI],
    ["chart-3", "card", AA_UI],
    ["chart-4", "card", AA_UI],
    ["chart-5", "card", AA_UI],
  ];

  it.each(
    THEMES.flatMap((theme) =>
      (["page", ...SURFACES] as Context[]).map((context) => ({
        theme,
        context,
      })),
    ),
  )(
    "shadcn/ui pairs pass in the $theme theme: $context",
    ({ theme, context }) => {
      const failing = SHADCN_PAIRS.map(([foreground, background, min]) => ({
        pair: `${foreground} on ${background}`,
        ratio: contrastRatio(
          shadcnValue(theme, context, foreground),
          shadcnValue(theme, context, background),
        ),
        min,
      })).filter(({ ratio, min }) => ratio < min);
      expect(failing).toEqual([]);
    },
  );

  it.each(
    THEMES.flatMap((theme) => SURFACES.map((surface) => ({ theme, surface }))),
  )(
    "form states and links stay readable on the $surface surface ($theme)",
    ({ theme, surface }) => {
      const colors = palette(theme, surface);
      for (const token of [
        "toner",
        "toner-muted",
        "pen",
        "success",
        "danger",
        "warning",
        "info",
      ]) {
        expect(
          contrastRatio(colors.get(token) ?? "", colors.get("paper") ?? ""),
        ).toBeGreaterThanOrEqual(AA_TEXT);
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
