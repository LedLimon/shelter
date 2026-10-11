import { describe, expect, it } from "vitest";
import {
  isTimeZone,
  RUSSIAN_TIME_ZONES,
  timeZoneOptions,
  utcOffset,
} from "./time-zones";

const AT = new Date("2026-10-11T12:00:00Z");

describe("isTimeZone", () => {
  it("accepts IANA zones and rejects everything else", () => {
    expect(isTimeZone("Europe/Moscow")).toBe(true);
    expect(isTimeZone("Asia/Yekaterinburg")).toBe(true);
    expect(isTimeZone("Moscow")).toBe(false);
    expect(isTimeZone("")).toBe(false);
  });
});

describe("utcOffset", () => {
  it("formats whole and half-hour offsets with a real minus", () => {
    expect(utcOffset("Europe/Moscow", AT)).toBe("UTC+3");
    expect(utcOffset("Asia/Kolkata", AT)).toBe("UTC+5:30");
    expect(utcOffset("America/New_York", AT)).toBe("UTC−4");
    expect(utcOffset("UTC", AT)).toBe("UTC+0");
  });
});

describe("RUSSIAN_TIME_ZONES", () => {
  it("lists every offset of Russia once, west to east", () => {
    const offsets = RUSSIAN_TIME_ZONES.map(({ value }) => utcOffset(value, AT));

    expect(offsets).toEqual(
      Array.from({ length: 11 }, (_, index) => `UTC+${index + 2}`),
    );
    expect(RUSSIAN_TIME_ZONES.every(({ value }) => isTimeZone(value))).toBe(
      true,
    );
  });
});

describe("timeZoneOptions", () => {
  it("labels the Russian zones with the city and the offset", () => {
    const options = timeZoneOptions("Europe/Moscow", AT);

    expect(options).toHaveLength(RUSSIAN_TIME_ZONES.length);
    expect(options[1]).toEqual({
      value: "Europe/Moscow",
      label: "Москва (UTC+3)",
    });
  });

  it("keeps a current zone that is not in the list", () => {
    const [first, ...rest] = timeZoneOptions("Asia/Tbilisi", AT);

    expect(first).toEqual({
      value: "Asia/Tbilisi",
      label: "Asia/Tbilisi (UTC+4)",
    });
    expect(rest).toHaveLength(RUSSIAN_TIME_ZONES.length);
  });

  it("doesn't offer a current value that is not a time zone", () => {
    expect(timeZoneOptions("nonsense", AT)).toHaveLength(
      RUSSIAN_TIME_ZONES.length,
    );
  });
});
