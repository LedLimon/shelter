import { Sofia_Sans } from "next/font/google";

// Text face of the admin (Operate mode, docs/design.md#шрифты): Sofia Sans of
// normal width, the same superfamily as the display face. Declared here and
// not in src/app/fonts.ts, so only /admin routes load and preload it.
const adminFont = Sofia_Sans({
  subsets: ["cyrillic", "latin"],
});

/**
 * The value of `--font-face-text` inside the admin. Sofia Sans has no ₽
 * (like its condensed sibling), so the sign comes from the mono face: a
 * grotesque ₽ that follows the weight, loaded only where a ₽ is shown.
 */
export const adminTextFace = `${adminFont.style.fontFamily}, var(--font-face-mono)`;
