import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { formatCount, plural, type PluralForms } from "@/lib/plural";

const NBSP = "\u00A0";
const dogs: PluralForms = ["собака", "собаки", "собак"];

describe("plural", () => {
  it.each([
    [0, "собак"],
    [1, "собака"],
    [2, "собаки"],
    [5, "собак"],
    [11, "собак"],
    [12, "собак"],
    [14, "собак"],
    [21, "собака"],
    [22, "собаки"],
    [25, "собак"],
    [101, "собака"],
    [111, "собак"],
  ])("%i %s", (n, expected) => {
    expect(plural(n, dogs)).toBe(expected);
  });

  it.each([
    [3, "собаки"],
    [4, "собаки"],
    [13, "собак"],
    [20, "собак"],
    [24, "собаки"],
    [100, "собак"],
    [104, "собаки"],
    [112, "собак"],
    [1001, "собака"],
    [1011, "собак"],
    [1_000_000, "собак"],
  ])("%i %s", (n, expected) => {
    expect(plural(n, dogs)).toBe(expected);
  });

  it("ignores the sign", () => {
    expect(plural(-1, ["градус", "градуса", "градусов"])).toBe("градус");
    expect(plural(-3, ["градус", "градуса", "градусов"])).toBe("градуса");
    expect(plural(-11, ["градус", "градуса", "градусов"])).toBe("градусов");
  });

  it("uses the few form for fractions", () => {
    expect(plural(1.5, ["час", "часа", "часов"])).toBe("часа");
    expect(plural(0.5, ["час", "часа", "часов"])).toBe("часа");
  });

  it.each([Number.NaN, Infinity, -Infinity])("rejects %s", (n) => {
    expect(() => plural(n, dogs)).toThrow(RangeError);
  });

  it("agrees with Intl.PluralRules for ru (property)", () => {
    const rules = new Intl.PluralRules("ru-RU");
    const formByCategory: Partial<Record<Intl.LDMLPluralRule, string>> = {
      one: "собака",
      few: "собаки",
      many: "собак",
      other: "собаки", // fractions
    };
    // Fractions with up to two decimals: Intl rounds longer ones to three.
    const fraction = fc
      .tuple(fc.integer(), fc.integer({ min: 1, max: 99 }))
      .map(([whole, hundredths]) => whole + hundredths / 100);
    fc.assert(
      fc.property(fc.oneof(fc.maxSafeInteger(), fraction), (n) => {
        expect(plural(n, dogs)).toBe(formByCategory[rules.select(n)]);
      }),
    );
  });
});

describe("formatCount", () => {
  it("joins the number and the word with a non-breaking space", () => {
    expect(formatCount(5, dogs)).toBe(`5${NBSP}собак`);
    expect(formatCount(21, dogs)).toBe(`21${NBSP}собака`);
  });

  it("groups thousands with non-breaking spaces", () => {
    expect(formatCount(1000, dogs)).toBe(`1${NBSP}000${NBSP}собак`);
    expect(formatCount(1_000_001, dogs)).toBe(
      `1${NBSP}000${NBSP}001${NBSP}собака`,
    );
  });

  it("rejects fractions", () => {
    expect(() => formatCount(1.5, dogs)).toThrow(RangeError);
  });
});
