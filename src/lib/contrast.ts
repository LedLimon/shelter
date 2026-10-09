// WCAG 2.1 contrast ratio: https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio

/** Thresholds for WCAG 2.1 AA: normal text and non-text UI (borders, focus rings, icons). */
export const AA_TEXT = 4.5;
export const AA_UI = 3;

/** Parses `#rgb` or `#rrggbb` into 0–255 channels. */
export function parseHex(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) throw new Error(`Not a hex colour: ${hex}`);
  const digits =
    match[1].length === 3
      ? [...match[1]].map((digit) => digit + digit).join("")
      : match[1];
  return [0, 2, 4].map((start) =>
    Number.parseInt(digits.slice(start, start + 2), 16),
  ) as [number, number, number];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [
    relativeLuminance(foreground),
    relativeLuminance(background),
  ].sort((a, b) => b - a) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Formats a ratio the way docs/design.md shows it: «17,43:1». */
export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(2).replace(".", ",")}:1`;
}
