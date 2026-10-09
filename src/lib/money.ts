// Amounts are integer kopecks everywhere (AGENTS.md, invariant 1). Both
// directions work on digit strings, so no float ever touches an amount.

const NBSP = "\u00A0";
const MINUS = "\u2212";

export type FormatRubOptions = {
  /**
   * `"auto"` (default) shows kopecks only when there are any: `2 500 ₽`,
   * `2 500,50 ₽`. `"always"` keeps two digits: `2 500,00 ₽`.
   */
  kopecks?: "auto" | "always";
  /** Append `₽` (default). Off for input values where `₽` is a separate label. */
  symbol?: boolean;
};

/**
 * Formats integer kopecks as rubles: `250050` → `2 500,50 ₽`. Digit groups
 * and the `₽` are separated by non-breaking spaces, negatives get a real
 * minus sign (`−1 500 ₽`). Accepts `bigint` for SQL sums. Throws a RangeError
 * on a non-integer: that is a bug upstream, not something to round away.
 */
export function formatRub(
  kop: number | bigint,
  { kopecks = "auto", symbol = true }: FormatRubOptions = {},
): string {
  if (typeof kop === "number" && !Number.isSafeInteger(kop)) {
    throw new RangeError(`formatRub expects integer kopecks, got ${kop}`);
  }

  const negative = kop < 0;
  const digits = String(negative ? -kop : kop).padStart(3, "0");
  const rubles = digits.slice(0, -2).replace(/\B(?=(\d{3})+$)/g, NBSP);
  const cents = digits.slice(-2);

  let result = negative ? MINUS + rubles : rubles;
  if (kopecks === "always" || cents !== "00") result += `,${cents}`;
  if (symbol) result += `${NBSP}₽`;
  return result;
}

export type RubInputError =
  "empty" | "invalid" | "negative" | "too-many-decimals" | "too-large";

export type RubInputResult =
  { ok: true; kop: number } | { ok: false; error: RubInputError };

// Spaces people (and formatRub) put between digit groups.
const GROUP_SPACE = "[ \u00A0\u202F\u2009]";
const INTEGER = `(\\d{1,3}(?:${GROUP_SPACE}\\d{3})+|\\d+)`;
const AMOUNT = new RegExp(`^${INTEGER}(?:[.,](\\d{1,2}))?$`);
const LONG_FRACTION = new RegExp(`^${INTEGER}[.,]\\d{3,}$`);
const CURRENCY_SUFFIX = /(?:₽|руб\.?|р\.?)$/i;
const LEADING_MINUS = /^[-\u2212\u2013\u2014]/;

/**
 * Parses what a person typed into an amount field, with the reason when it
 * isn't an amount. Accepts `2500`, `2 500`, `2 500,50`, `2500.5`, `2 500 ₽`,
 * `500 руб.`; digit groups must be complete (`25 00` is rejected), at most
 * two digits after `,` or `.` (so `2.500` and `2,500` are rejected rather
 * than guessed). `0` is a valid amount: minimums are the caller's business.
 */
export function validateRubInput(input: string): RubInputResult {
  const text = input.trim();
  if (text === "") return { ok: false, error: "empty" };
  if (LEADING_MINUS.test(text)) return { ok: false, error: "negative" };

  const amount = text.replace(CURRENCY_SUFFIX, "").trimEnd();
  const match = AMOUNT.exec(amount);
  if (!match) {
    const error = LONG_FRACTION.test(amount) ? "too-many-decimals" : "invalid";
    return { ok: false, error };
  }

  const [, integer = "", fraction = ""] = match;
  const kop = Number(integer.replace(/\D/g, "") + fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(kop)) return { ok: false, error: "too-large" };
  return { ok: true, kop };
}

/** Kopecks from an amount field (`'2 500,50'` → `250050`), or null if invalid. */
export function parseRubInput(input: string): number | null {
  const result = validateRubInput(input);
  return result.ok ? result.kop : null;
}
