import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  daysFromToday,
  describeDeadline,
  formatDate,
  formatDateNumeric,
  formatDateTime,
  formatRelative,
  formatTime,
} from "@/lib/dates";

const _ = "\u00A0"; // between a number and its word
const MSK = "Europe/Moscow"; // UTC+3 all year since 2014
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const utc = (iso: string) => new Date(`${iso}Z`);
// 2026-10-08 23:59:59.999 and 2026-10-09 00:00 in Moscow.
const LAST_MS_OF_OCT_8 = utc("2026-10-08T20:59:59.999");
const START_OF_OCT_9 = utc("2026-10-08T21:00:00");

describe("formatDate", () => {
  const now = utc("2026-10-09T09:00:00");

  it("switches the day at Moscow midnight, not at UTC midnight", () => {
    expect(formatDate(LAST_MS_OF_OCT_8, { timeZone: MSK, now })).toBe(
      `8${_}октября`,
    );
    expect(formatDate(START_OF_OCT_9, { timeZone: MSK, now })).toBe(
      `9${_}октября`,
    );
    expect(formatDate(START_OF_OCT_9, { timeZone: "UTC", now })).toBe(
      `8${_}октября`,
    );
  });

  it("uses the time zone it is given", () => {
    const date = utc("2026-10-08T15:00:00");
    expect(formatDate(date, { timeZone: MSK, now })).toBe(`8${_}октября`);
    expect(formatDate(date, { timeZone: "Asia/Vladivostok", now })).toBe(
      `9${_}октября`,
    );
  });

  it("omits the current year and shows any other", () => {
    expect(formatDate(utc("2025-10-08T12:00:00"), { timeZone: MSK, now })).toBe(
      `8${_}октября 2025`,
    );
    expect(formatDate(utc("2027-01-15T12:00:00"), { timeZone: MSK, now })).toBe(
      `15${_}января 2027`,
    );
  });

  it("takes the year in the shelter time zone too", () => {
    const newYear = utc("2025-12-31T21:00:00"); // 2026-01-01 00:00 in Moscow
    expect(formatDate(newYear, { timeZone: MSK, now })).toBe(`1${_}января`);
    expect(formatDate(newYear, { timeZone: "UTC", now })).toBe(
      `31${_}декабря 2025`,
    );
  });

  it("shows the year with year: 'always', without «г.»", () => {
    expect(
      formatDate(START_OF_OCT_9, { timeZone: MSK, now, year: "always" }),
    ).toBe(`9${_}октября 2026`);
  });

  it("throws on an invalid date or time zone", () => {
    expect(() => formatDate(new Date(Number.NaN), { timeZone: MSK })).toThrow(
      RangeError,
    );
    expect(() => formatDate(now, { timeZone: "Mars/Olympus" })).toThrow(
      RangeError,
    );
  });
});

describe("formatTime, formatDateTime, formatDateNumeric", () => {
  const date = utc("2026-10-08T21:05:00"); // 00:05 on 9 October in Moscow
  const now = utc("2026-10-09T09:00:00");

  it("formats in the shelter time zone", () => {
    expect(formatTime(date, { timeZone: MSK })).toBe("00:05");
    expect(formatTime(date, { timeZone: "UTC" })).toBe("21:05");
    expect(formatDateTime(date, { timeZone: MSK, now })).toBe(
      `9${_}октября в 00:05`,
    );
    expect(formatDateNumeric(date, { timeZone: MSK })).toBe("09.10.2026");
    expect(formatDateNumeric(date, { timeZone: "UTC" })).toBe("08.10.2026");
  });

  it("uses a 24-hour clock", () => {
    expect(formatTime(utc("2026-10-08T11:30:00"), { timeZone: MSK })).toBe(
      "14:30",
    );
    expect(
      formatDateTime(utc("2025-03-01T20:00:00"), { timeZone: MSK, now }),
    ).toBe(`1${_}марта 2025 в 23:00`);
  });
});

describe("daysFromToday", () => {
  it("counts calendar days in the shelter time zone", () => {
    const now = LAST_MS_OF_OCT_8;
    expect(daysFromToday(START_OF_OCT_9, { timeZone: MSK, now })).toBe(1);
    expect(daysFromToday(START_OF_OCT_9, { timeZone: "UTC", now })).toBe(0);
    expect(
      daysFromToday(utc("2026-10-07T21:00:00"), { timeZone: MSK, now }),
    ).toBe(0);
    expect(
      daysFromToday(utc("2026-10-07T20:59:59"), { timeZone: MSK, now }),
    ).toBe(-1);
  });

  it("crosses months and years", () => {
    const now = utc("2026-12-31T12:00:00");
    expect(
      daysFromToday(utc("2027-01-01T12:00:00"), { timeZone: MSK, now }),
    ).toBe(1);
    expect(
      daysFromToday(utc("2027-03-01T12:00:00"), { timeZone: MSK, now }),
    ).toBe(60);
  });

  it("matches UTC+3 day arithmetic in Moscow (property)", () => {
    const dates = fc.date({
      min: utc("2015-01-01T00:00:00"),
      max: utc("2100-01-01T00:00:00"),
      noInvalidDate: true,
    });
    const mskDay = (d: Date) => Math.floor((d.getTime() + 3 * HOUR) / DAY);
    fc.assert(
      fc.property(dates, dates, (date, now) => {
        expect(daysFromToday(date, { timeZone: MSK, now })).toBe(
          mskDay(date) - mskDay(now),
        );
      }),
    );
  });
});

describe("formatRelative", () => {
  const now = utc("2026-10-09T09:00:00"); // 12:00 in Moscow
  const at = (offset: number) => new Date(now.getTime() + offset);
  const relative = (offset: number, timeZone = MSK) =>
    formatRelative(at(offset), { timeZone, now });

  it("says «только что» for the last minute and «сейчас» for the next", () => {
    expect(relative(0)).toBe("только что");
    expect(relative(-59_999)).toBe("только что");
    expect(relative(30_000)).toBe("сейчас");
  });

  it("counts whole minutes within an hour", () => {
    expect(relative(-MINUTE)).toBe(`1${_}минуту назад`);
    expect(relative(-5 * MINUTE)).toBe(`5${_}минут назад`);
    expect(relative(-HOUR + 1)).toBe(`59${_}минут назад`);
    expect(relative(2 * MINUTE)).toBe(`через 2${_}минуты`);
  });

  it("counts whole hours within a day", () => {
    expect(relative(-HOUR)).toBe(`1${_}час назад`);
    expect(relative(-2 * HOUR)).toBe(`2${_}часа назад`);
    expect(relative(3 * HOUR + 59 * MINUTE)).toBe(`через 3${_}часа`);
    expect(relative(-DAY + 1)).toBe(`23${_}часа назад`);
  });

  it("keeps hours across midnight within a day", () => {
    // 00:30 on 9 October and 23:00 on 8 October in Moscow.
    expect(
      formatRelative(utc("2026-10-08T20:00:00"), {
        timeZone: MSK,
        now: utc("2026-10-08T21:30:00"),
      }),
    ).toBe(`1${_}час назад`);
  });

  it("switches to calendar days after 24 hours", () => {
    expect(relative(-DAY)).toBe("вчера");
    expect(relative(DAY)).toBe("завтра");
    // 12:00 on the 9th → 00:30 on the 11th: 36.5 hours, two calendar days.
    expect(relative(36 * HOUR + 30 * MINUTE)).toBe(`через 2${_}дня`);
    expect(relative(-2 * DAY)).toBe(`2${_}дня назад`);
    expect(relative(3 * DAY)).toBe(`через 3${_}дня`);
    expect(relative(-6 * DAY)).toBe(`6${_}дней назад`);
  });

  it("gives the date a week or more away", () => {
    expect(relative(-7 * DAY)).toBe(`2${_}октября`);
    expect(relative(30 * DAY)).toBe(`8${_}ноября`);
    expect(relative(-400 * DAY)).toBe(`4${_}сентября 2025`);
  });

  it("stays in hours over a 25-hour day at a DST switch", () => {
    // Berlin falls back on 2026-10-25: 00:10 CEST → 23:30 CET is 24 h 20 min.
    expect(
      formatRelative(utc("2026-10-24T22:10:00"), {
        timeZone: "Europe/Berlin",
        now: utc("2026-10-25T22:30:00"),
      }),
    ).toBe(`24${_}часа назад`);
  });

  it("throws on an invalid date", () => {
    expect(() =>
      formatRelative(new Date(Number.NaN), { timeZone: MSK, now }),
    ).toThrow(RangeError);
  });

  it("points to the past or the future, never the wrong way (property)", () => {
    const offsets = fc.integer({ min: -6 * DAY, max: 6 * DAY });
    const past = /^(только что|вчера|\d+\u00A0[а-я]+ назад)$/;
    const future = /^(сейчас|завтра|через \d+\u00A0[а-я]+)$/;
    fc.assert(
      fc.property(offsets, (offset) => {
        expect(relative(offset)).toMatch(offset > 0 ? future : past);
      }),
    );
  });
});

describe("describeDeadline", () => {
  // The last day is 25 October in Moscow, stored as its start or its end.
  const deadlines = [
    utc("2026-10-24T21:00:00"),
    utc("2026-10-25T20:59:59.999"),
  ];

  it.each(deadlines)("counts days to the deadline day (%s)", (deadline) => {
    expect(
      describeDeadline(deadline, {
        timeZone: MSK,
        now: utc("2026-10-09T09:00:00"),
      }),
    ).toEqual({
      daysLeft: 16,
      isOverdue: false,
      date: `25${_}октября`,
      relative: `через 16${_}дней`,
    });
  });

  it.each(deadlines)(
    "is not overdue until Moscow midnight (%s)",
    (deadline) => {
      const asOf = (now: Date) =>
        describeDeadline(deadline, { timeZone: MSK, now });

      expect(asOf(utc("2026-10-24T20:59:59"))).toMatchObject({
        daysLeft: 1,
        isOverdue: false,
        relative: "завтра",
      });
      expect(asOf(utc("2026-10-25T20:59:59"))).toMatchObject({
        daysLeft: 0,
        isOverdue: false,
        relative: "сегодня",
      });
      // Still 25 October in UTC, already 26 October in Moscow.
      expect(asOf(utc("2026-10-25T21:00:00"))).toMatchObject({
        daysLeft: -1,
        isOverdue: true,
        relative: "вчера",
      });
      expect(asOf(utc("2026-10-28T09:00:00"))).toMatchObject({
        daysLeft: -3,
        isOverdue: true,
        relative: `3${_}дня назад`,
      });
    },
  );

  it("shows the year of a deadline in another year", () => {
    expect(
      describeDeadline(utc("2027-01-15T12:00:00"), {
        timeZone: MSK,
        now: utc("2026-12-20T12:00:00"),
      }),
    ).toMatchObject({ date: `15${_}января 2027`, daysLeft: 26 });
  });
});
