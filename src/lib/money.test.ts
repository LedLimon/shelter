import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  formatRub,
  MAX_AMOUNT_KOP,
  parseRubInput,
  validateRubInput,
  type FormatRubOptions,
} from "@/lib/money";

const NBSP = "\u00A0";
const NARROW_NBSP = "\u202F";
const THIN_SPACE = "\u2009";
const MINUS = "\u2212";
// Expected strings are written with ordinary spaces; formatRub puts non-breaking ones.
const nb = (text: string) => text.replaceAll(" ", NBSP);

describe("formatRub", () => {
  it.each([
    [0, "0 ₽"],
    [5, "0,05 ₽"],
    [100, "1 ₽"],
    [99_900, "999 ₽"],
    [100_000, "1 000 ₽"],
    [250_000, "2 500 ₽"],
    [250_050, "2 500,50 ₽"],
    [250_005, "2 500,05 ₽"],
    [99_999_999, "999 999,99 ₽"],
    [100_000_000, "1 000 000 ₽"],
  ])("%i kop → %s", (kop, expected) => {
    expect(formatRub(kop)).toBe(nb(expected));
  });

  it("separates groups and ₽ with non-breaking spaces only", () => {
    expect(formatRub(123_456_789)).toBe(`1${NBSP}234${NBSP}567,89${NBSP}₽`);
  });

  it("writes negatives with a minus sign, not a hyphen", () => {
    expect(formatRub(-150_000)).toBe(nb(`${MINUS}1 500 ₽`));
    expect(formatRub(-5)).toBe(nb(`${MINUS}0,05 ₽`));
    expect(formatRub(-0)).toBe(nb("0 ₽"));
  });

  it("keeps zero kopecks with kopecks: 'always'", () => {
    expect(formatRub(250_000, { kopecks: "always" })).toBe(nb("2 500,00 ₽"));
    expect(formatRub(0, { kopecks: "always" })).toBe(nb("0,00 ₽"));
    expect(formatRub(250_050, { kopecks: "always" })).toBe(nb("2 500,50 ₽"));
  });

  it("drops ₽ with symbol: false", () => {
    expect(formatRub(250_050, { symbol: false })).toBe(nb("2 500,50"));
    expect(formatRub(250_000, { symbol: false })).toBe(nb("2 500"));
  });

  it("formats bigint sums beyond the safe integer range", () => {
    expect(formatRub(BigInt("123456789012345678"))).toBe(
      nb("1 234 567 890 123 456,78 ₽"),
    );
    expect(formatRub(BigInt(-100))).toBe(nb(`${MINUS}1 ₽`));
  });

  it.each([1.5, 0.1, Number.NaN, Infinity, 2 ** 53])(
    "rejects %s: kopecks are safe integers",
    (kop) => {
      expect(() => formatRub(kop)).toThrow(RangeError);
    },
  );

  const options = fc.record<FormatRubOptions>(
    {
      kopecks: fc.constantFrom("auto", "always"),
      symbol: fc.boolean(),
    },
    { requiredKeys: [] },
  );

  it("matches Intl's ru-RU currency format (property)", () => {
    const intl = new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
    });
    fc.assert(
      fc.property(fc.maxSafeInteger(), (kop) => {
        // A decimal string keeps Intl exact where kop / 100 would not be.
        // Fails if ICU changes ru-RU separators: then decide whether to follow.
        const expected = intl
          .format(`${kop}E-2` as Intl.StringNumericLiteral)
          .replace("-", MINUS);
        expect(formatRub(kop, { kopecks: "always" })).toBe(expected);
      }),
    );
  });

  it("gives the same text for number and bigint (property)", () => {
    fc.assert(
      fc.property(fc.maxSafeInteger(), options, (kop, opts) => {
        expect(formatRub(BigInt(kop), opts)).toBe(formatRub(kop, opts));
      }),
    );
  });

  it("never contains an ordinary space (property)", () => {
    fc.assert(
      fc.property(fc.maxSafeInteger(), options, (kop, opts) => {
        expect(formatRub(kop, opts)).not.toContain(" ");
      }),
    );
  });
});

describe("parseRubInput", () => {
  it("reads '2 500,50' as 250050 kopecks", () => {
    expect(parseRubInput("2 500,50")).toBe(250_050);
  });

  it.each([
    ["2500", 250_000],
    ["2 500", 250_000],
    [`2${NBSP}500`, 250_000],
    [`2${NARROW_NBSP}500`, 250_000],
    [`2${THIN_SPACE}500`, 250_000],
    ["1 000 000", 100_000_000],
    ["2500,5", 250_050],
    ["2500.5", 250_050],
    ["2500.05", 250_005],
    ["0,5", 50],
    ["0,05", 5],
    ["0", 0],
    ["007", 700],
    ["  1 500  ", 150_000],
    [`${NBSP}1 500${NBSP}`, 150_000],
    ["2 500 ₽", 250_000],
    ["2500₽", 250_000],
    [`2 500,50${NBSP}₽`, 250_050],
    ["500 руб.", 50_000],
    ["500 руб", 50_000],
    ["500 Руб.", 50_000],
    ["500 р.", 50_000],
    ["500р", 50_000],
    ["21 474 836,47", MAX_AMOUNT_KOP],
  ])("%j → %i", (input, kop) => {
    expect(parseRubInput(input)).toBe(kop);
    expect(validateRubInput(input)).toEqual({ ok: true, kop });
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    [NBSP, "empty"],
    ["-500", "negative"],
    [`${MINUS}500`, "negative"],
    ["\u2013500", "negative"], // en dash
    ["- 500", "negative"],
    ["-500 ₽", "negative"],
    ["2,500", "too-many-decimals"],
    ["2.500", "too-many-decimals"],
    ["1 500,555", "too-many-decimals"],
    ["-2,555", "too-many-decimals"],
    ["21 474 836,48", "too-large"],
    ["21474837", "too-large"],
    ["99999999999999999999", "too-large"],
    ["abc", "invalid"],
    ["₽", "empty"],
    [" руб. ", "empty"],
    ["-abc", "invalid"],
    ["-", "invalid"],
    ["0 500", "invalid"],
    ["000 000", "invalid"],
    ["25 00", "invalid"],
    ["2 50", "invalid"],
    ["2  500", "invalid"],
    ["2 5000", "invalid"],
    ["1.000.000", "invalid"],
    ["1,000.50", "invalid"],
    ["1 500,5 0", "invalid"],
    ["12,3,4", "invalid"],
    ["2 500,", "invalid"],
    [",5", "invalid"],
    ["+500", "invalid"],
    ["1e3", "invalid"],
    ["0x10", "invalid"],
    ["Infinity", "invalid"],
    ["500 рублей", "invalid"],
    ["₽ 500", "invalid"],
    ["\u0663\u0660\u0660", "invalid"], // Arabic-Indic 300
  ])("rejects %j: %s", (input, error) => {
    expect(parseRubInput(input)).toBeNull();
    expect(validateRubInput(input)).toEqual({ ok: false, error });
  });

  it("reads back whatever formatRub writes (property)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_AMOUNT_KOP }),
        fc.constantFrom("auto", "always"),
        fc.boolean(),
        (kop, kopecks, symbol) => {
          expect(parseRubInput(formatRub(kop, { kopecks, symbol }))).toBe(kop);
        },
      ),
    );
  });

  it("reads hand-typed amounts in every accepted spelling (property)", () => {
    const typed = fc
      .record({
        kop: fc.integer({ min: 0, max: MAX_AMOUNT_KOP }),
        group: fc.constantFrom(null, " ", NBSP, NARROW_NBSP, THIN_SPACE),
        separator: fc.constantFrom(",", "."),
        shortFraction: fc.boolean(),
        dropZeroFraction: fc.boolean(),
        suffix: fc.constantFrom("", "₽", " ₽", `${NBSP}₽`, " руб.", "р"),
        padding: fc.constantFrom("", " ", NBSP),
      })
      .map((r) => {
        const rubles = String(Math.trunc(r.kop / 100));
        const integer = r.group
          ? rubles.replace(/\B(?=(\d{3})+$)/g, r.group)
          : rubles;
        let fraction = String(r.kop % 100).padStart(2, "0");
        if (r.shortFraction && fraction.endsWith("0")) fraction = fraction[0]!;
        const withFraction =
          fraction === "00" && r.dropZeroFraction
            ? integer
            : `${integer}${r.separator}${fraction}`;
        return {
          input: `${r.padding}${withFraction}${r.suffix}${r.padding}`,
          kop: r.kop,
        };
      });

    fc.assert(
      fc.property(typed, ({ input, kop }) => {
        expect(parseRubInput(input)).toBe(kop);
      }),
    );
  });

  it("returns null or kopecks within limits for any string (property)", () => {
    const amountish = fc.string({
      unit: fc.constantFrom(..."0123456789 ,.-₽р", NBSP, MINUS),
      maxLength: 24,
    });
    fc.assert(
      fc.property(fc.oneof(amountish, fc.string({ unit: "binary" })), (s) => {
        const kop = parseRubInput(s);
        if (kop === null) return;
        expect(Number.isInteger(kop)).toBe(true);
        expect(kop).toBeGreaterThanOrEqual(0);
        expect(kop).toBeLessThanOrEqual(MAX_AMOUNT_KOP);
      }),
    );
  });
});
