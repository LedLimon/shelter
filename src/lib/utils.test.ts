import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { cn, MERGE_BORDER_WIDTHS, MERGE_THEME } from "@/lib/utils";

const css = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

/** Names of `--<namespace>-<name>:` theme variables declared in globals.css. */
function themeNames(namespace: string): string[] {
  const names = [
    ...css.matchAll(new RegExp(`^\\s*--${namespace}-([a-z0-9-]+):`, "gm")),
  ].map((match) => match[1] ?? "");
  // Sub-properties (--text-hero--line-height) are not keys, and T-shirt sizes
  // (shadcn's radius scale) are known to tailwind-merge already.
  return [
    ...new Set(
      names.filter(
        (name) => !name.includes("--") && !/^(?:xs|sm|md|lg|\d?xl)$/.test(name),
      ),
    ),
  ].sort();
}

describe("cn", () => {
  it("lets the last conflicting Tailwind class win", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("drops falsy values", () => {
    expect(cn("text-sm", undefined, null, false)).toBe("text-sm");
  });

  it.each([
    ["text", "text"],
    ["spacing", "spacing"],
    ["radius", "radius"],
    ["shadow", "shadow"],
    ["font-weight", "font-weight"],
  ] as const)("knows every --%s-* token from globals.css", (namespace, key) => {
    expect([...MERGE_THEME[key]].sort()).toEqual(themeNames(namespace));
  });

  it("knows every font token from globals.css", () => {
    expect([...MERGE_THEME.font].sort()).toEqual(
      themeNames("font").filter((name) => name !== "weight-ultra"),
    );
  });

  it("knows every --border-width-* token from globals.css", () => {
    expect([...MERGE_BORDER_WIDTHS].sort()).toEqual(themeNames("border-width"));
  });

  it("keeps a token size next to a token colour", () => {
    expect(cn("text-label text-toner")).toBe("text-label text-toner");
    expect(cn("border-line border-toner")).toBe("border-line border-toner");
    expect(cn("border-l-line border-toner")).toBe("border-l-line border-toner");
    expect(cn("border-bs-line border-toner")).toBe(
      "border-bs-line border-toner",
    );
    expect(cn("divide-y-line divide-perforation")).toBe(
      "divide-y-line divide-perforation",
    );
    expect(cn("font-display font-ultra")).toBe("font-display font-ultra");
    expect(cn("shadow-sheet ring-pen")).toBe("shadow-sheet ring-pen");
  });

  it("resolves conflicts between tokens", () => {
    expect(cn("text-body", "text-caption")).toBe("text-caption");
    expect(cn("p-sheet", "p-card")).toBe("p-card");
    expect(cn("rounded-sheet", "rounded-stamp")).toBe("rounded-stamp");
    expect(cn("border", "border-line")).toBe("border-line");
    expect(cn("font-body", "font-display")).toBe("font-display");
  });
});
