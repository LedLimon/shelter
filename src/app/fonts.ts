import {
  Literata,
  Martian_Mono,
  Sofia_Sans_Extra_Condensed,
} from "next/font/google";
import localFont from "next/font/local";

// Self-hosted at build time: the browser never calls Google Fonts.
// Axes and preloading: docs/design.md#шрифты. The variables feed
// --font-display / --font-body / --font-mono in globals.css.

// Headings, sums, names, labels, buttons. next/font cannot request a weight
// range, and Google serves the same file for 800–1000 as for the full axis.
export const displayFont = Sofia_Sans_Extra_Condensed({
  subsets: ["cyrillic", "latin"],
  variable: "--font-face-display",
});

// Sofia Sans Extra Condensed has no ₽ (U+20BD): the sign comes from Fira Sans
// Extra Condensed Black (OFL, see fonts/OFL-fira-sans.txt), subset to that one
// glyph (800 bytes). It goes first in --font-display; unicode-range keeps it to ₽.
export const roubleFont = localFont({
  src: "./fonts/rouble-fira-sans-extra-condensed-black.woff2",
  weight: "1 1000",
  variable: "--font-face-rouble",
  declarations: [{ prop: "unicode-range", value: "U+20BD" }],
  adjustFontFallback: false,
});

// Body text. Weight axis only: opsz doubles the files (81 → 172 KB).
export const bodyFont = Literata({
  subsets: ["cyrillic", "latin"],
  variable: "--font-face-body",
});

// Tabs, dates, categories. The width axis narrows the tear-off tabs; small
// text, so it is not preloaded.
export const monoFont = Martian_Mono({
  subsets: ["cyrillic", "latin"],
  axes: ["wdth"],
  variable: "--font-face-mono",
  preload: false,
});
