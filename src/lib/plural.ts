/** Word forms for 1, 2 and 5: `["собака", "собаки", "собак"]`. */
export type PluralForms = readonly [one: string, few: string, many: string];

/**
 * Picks the Russian word form for `n`: 1, 21, 101 → one; 2–4, 22–24 → few;
 * 0, 5–20, 25–30, 111 → many. Fractions take the few form («1,5 часа»).
 */
export function plural(n: number, [one, few, many]: PluralForms): string {
  if (!Number.isFinite(n)) {
    throw new RangeError(`plural expects a finite number, got ${n}`);
  }
  if (!Number.isInteger(n)) return few;

  const mod10 = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const countFormat = new Intl.NumberFormat("ru-RU");

/**
 * A count with its word, never split across lines: `5 собак`, `1 000 собак`
 * (non-breaking spaces). Counts are whole: throws a RangeError on fractions.
 */
export function formatCount(n: number, forms: PluralForms): string {
  if (!Number.isInteger(n)) {
    throw new RangeError(`formatCount expects an integer, got ${n}`);
  }
  return `${countFormat.format(n)}\u00A0${plural(n, forms)}`;
}
