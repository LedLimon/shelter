import type { CSSProperties } from "react";
import { DARK, LIGHT, type EmailColor } from "./palette";

// The look of a letter: the «Объявление» direction (docs/design.md#письма)
// within what mail clients render. No web fonts — Gmail, Mail.ru and Yandex
// drop them — so each stack names the site's face first, for the rare reader
// who has it, and then the closest faces the platforms ship. The names go
// unquoted (valid for these): a quote in a style attribute becomes an entity.

export const FONT = {
  /** Headings, sums, buttons: a bold condensed grotesque on every platform. */
  display:
    "Sofia Sans Extra Condensed,Arial Narrow,HelveticaNeue-CondensedBold,Roboto Condensed,sans-serif-condensed,Arial,sans-serif",
  /** Text: a book serif, like Literata on the site. */
  body: "Literata,Georgia,Times New Roman,serif",
  /** Labels of the form: dates, numbers, captions. */
  mono: "Martian Mono,SF Mono,Menlo,Consolas,Liberation Mono,Courier New,monospace",
} as const;

/** The widest a letter gets; narrower screens take the whole width. */
export const SHEET_WIDTH = 600;

/**
 * Which palette roles colour an element. The light value goes into the
 * inline style, the only thing every client reads; the class lets the
 * stylesheet swap it for the dark one where the client supports that.
 */
export type Ink = { bg?: EmailColor; fg?: EmailColor; border?: EmailColor };

const INK_PROPERTIES = {
  bg: "background-color",
  fg: "color",
  border: "border-color",
} as const;

/** `className` and `style` of an element coloured with `ink`. */
export function inked(
  ink: Ink,
  style: CSSProperties = {},
): { className: string; style: CSSProperties } {
  const colors: CSSProperties = {};
  if (ink.bg) colors.backgroundColor = LIGHT[ink.bg];
  if (ink.fg) colors.color = LIGHT[ink.fg];
  if (ink.border) colors.borderColor = LIGHT[ink.border];
  const className = (Object.keys(INK_PROPERTIES) as (keyof Ink)[])
    .filter((role) => ink[role])
    .map((role) => `${role}-${ink[role]}`)
    .join(" ");
  // Colours last: `border: 1px solid` before them must not reset the colour.
  return { className, style: { ...style, ...colors } };
}

/** The media query whose rules repaint a letter for a dark mail client. */
export const DARK_MEDIA = "@media (prefers-color-scheme: dark)";

/**
 * The letter's stylesheet. Clients that drop <style> (some Gmail setups) show
 * the inline light theme at the base sizes — a complete letter, only wider
 * margins on a phone.
 */
export function stylesheet(): string {
  const dark = (Object.keys(DARK) as EmailColor[])
    .flatMap((color) =>
      (Object.keys(INK_PROPERTIES) as (keyof Ink)[]).map(
        (role) =>
          `.${role}-${color}{${INK_PROPERTIES[role]}:${DARK[color]}!important}`,
      ),
    )
    .join("");
  return [
    ":root{color-scheme:light dark;supported-color-schemes:light dark}",
    "body{margin:0;padding:0;-webkit-text-size-adjust:100%;text-size-adjust:100%}",
    "a{text-underline-offset:3px}",
    // A phone gets the board's margin back as reading width.
    "@media (max-width:480px){.board{padding:12px 8px 24px!important}.inset{padding:20px 16px 24px!important}.title{font-size:34px!important}}",
    `${DARK_MEDIA}{${dark}}`,
  ].join("");
}

/**
 * Classes the plain-text version of a letter looks for (./render.tsx): what
 * a mail client lays out as a table or a link reads differently as text.
 */
export const TEXT_CLASS = {
  /** A table of facts: rows of «label   value». */
  form: "form",
  /** A link to the site by its name or host: the words alone, no address. */
  site: "site",
} as const;
