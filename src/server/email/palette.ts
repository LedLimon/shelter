// Mail clients know no CSS variables, so the letters carry the palette of the
// «Объявление» direction as plain values (the one file ESLint lets do that).
// palette.test.ts checks every value against src/app/globals.css: the tokens
// stay the source of truth, and a colour changes in both places at once.

/** The roles a letter uses; the names are the tokens' (docs/design.md#палитра). */
export type EmailColor =
  "board" | "paper" | "toner" | "toner-muted" | "pen" | "perforation";

export type EmailPalette = Readonly<Record<EmailColor, string>>;

export const LIGHT: EmailPalette = {
  board: "#d1d5d6",
  paper: "#fbfbf7",
  toner: "#161617",
  "toner-muted": "#55575b",
  pen: "#2244b0",
  perforation: "#8a8d90",
};

/** Applied by clients that honour `prefers-color-scheme` (Apple Mail, iOS). */
export const DARK: EmailPalette = {
  board: "#121315",
  paper: "#212224",
  toner: "#ecebe6",
  "toner-muted": "#a7a7a1",
  pen: "#9db2ff",
  perforation: "#6b6d70",
};

/**
 * The site's one shadow, a sheet lying on the board (`shadow-sheet`). Clients
 * that drop box-shadow show a flat sheet.
 */
export const SHEET_SHADOW =
  "0 1px 1px rgba(15,16,20,0.1), 0 14px 24px -16px rgba(15,16,20,0.55)";
