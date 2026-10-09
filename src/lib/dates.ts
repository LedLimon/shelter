// Time is stored in UTC and shown in the shelter's time zone. Every function
// takes the zone explicitly (an IANA name: `getEnv().SHELTER_TIMEZONE` on the
// server, later the `Setting`), so results don't depend on the machine's TZ
// and the module works the same on the server and in the browser.

const NBSP = "\u00A0";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// Up to this many calendar days away formatRelative says «3 дня назад»,
// further it gives the date.
const RELATIVE_DAYS_LIMIT = 7;

export type DateOptions = {
  /** IANA time zone of the shelter, e.g. `Europe/Moscow`. */
  timeZone: string;
  /**
   * The moment to count from; defaults to the current time. Pass it
   * explicitly in components rendered on both sides: the server's and the
   * browser's "now" differ, and so would the markup.
   */
  now?: Date;
};

const PRESETS = {
  date: { day: "numeric", month: "long", year: "numeric" },
  numeric: { day: "2-digit", month: "2-digit", year: "numeric" },
  time: { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

const formats = new Map<string, Intl.DateTimeFormat>();

function getFormat(preset: keyof typeof PRESETS, timeZone: string) {
  const key = `${preset} ${timeZone}`;
  let format = formats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat("ru-RU", { ...PRESETS[preset], timeZone });
    formats.set(key, format);
  }
  return format;
}

function getParts(date: Date, timeZone: string) {
  const parts = getFormat("date", timeZone).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return { day: part("day"), month: part("month"), year: part("year") };
}

/** Number of the calendar day `date` falls on in `timeZone`. */
function dayNumber(date: Date, timeZone: string): number {
  const parts = getFormat("numeric", timeZone).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  const midnight = new Date(0);
  midnight.setUTCFullYear(part("year"), part("month") - 1, part("day"));
  return midnight.getTime() / DAY;
}

const relativeAlways = new Intl.RelativeTimeFormat("ru-RU", {
  numeric: "always",
});
const relativeAuto = new Intl.RelativeTimeFormat("ru-RU", { numeric: "auto" });

// Glues a number to the next word with a non-breaking space, so «через 3 дня»
// never breaks between «3» and «дня».
const bindNumbers = (text: string) =>
  text.replace(/(\d) (?=\p{L})/gu, `$1${NBSP}`);

/** `сегодня`, `завтра`, `вчера`, `через 3 дня`, `5 дней назад`. */
function formatRelativeDays(days: number): string {
  const format = Math.abs(days) <= 1 ? relativeAuto : relativeAlways;
  return bindNumbers(format.format(days, "day"));
}

export type FormatDateOptions = DateOptions & {
  /** `"auto"` (default) omits the current year: `8 октября`, `8 октября 2025`. */
  year?: "auto" | "always";
};

/** Day and month in the shelter time zone: `8 октября`, `8 октября 2025`. */
export function formatDate(
  date: Date,
  { timeZone, now = new Date(), year = "auto" }: FormatDateOptions,
): string {
  const parts = getParts(date, timeZone);
  const dayMonth = `${parts.day}${NBSP}${parts.month}`;
  if (year === "auto" && parts.year === getParts(now, timeZone).year) {
    return dayMonth;
  }
  return `${dayMonth} ${parts.year}`;
}

/** `08.10.2026` — for tables and documents. */
export function formatDateNumeric(
  date: Date,
  { timeZone }: Pick<DateOptions, "timeZone">,
): string {
  return getFormat("numeric", timeZone).format(date);
}

/** `14:05` in the shelter time zone. */
export function formatTime(
  date: Date,
  { timeZone }: Pick<DateOptions, "timeZone">,
): string {
  return getFormat("time", timeZone).format(date);
}

/** `8 октября в 14:05`, `8 октября 2025 в 14:05`. */
export function formatDateTime(date: Date, options: FormatDateOptions): string {
  return `${formatDate(date, options)} в ${formatTime(date, options)}`;
}

/**
 * Calendar days from today to the day of `date` in the shelter time zone:
 * 0 — today, 1 — tomorrow, −1 — yesterday. 23:59 and 00:01 are a day apart.
 */
export function daysFromToday(
  date: Date,
  { timeZone, now = new Date() }: DateOptions,
): number {
  return dayNumber(date, timeZone) - dayNumber(now, timeZone);
}

/**
 * How long ago or how soon: `только что`, `5 минут назад`, `через 2 часа`,
 * `вчера`, `через 3 дня`; a week or more away — the date (`8 октября`).
 * Minutes and hours count elapsed time, days count calendar days in the
 * shelter time zone.
 */
export function formatRelative(date: Date, options: DateOptions): string {
  const now = options.now ?? new Date();
  const diff = date.getTime() - now.getTime();
  const sign = diff < 0 ? -1 : 1;
  const abs = Math.abs(diff);

  if (abs < MINUTE) return diff > 0 ? "сейчас" : "только что";
  if (abs < HOUR) {
    return bindNumbers(
      relativeAlways.format(sign * Math.floor(abs / MINUTE), "minute"),
    );
  }

  const days = daysFromToday(date, { ...options, now });
  // A 25-hour day (DST switch) can fit more than 24 hours into one date.
  if (abs < DAY || days === 0) {
    return bindNumbers(
      relativeAlways.format(sign * Math.floor(abs / HOUR), "hour"),
    );
  }
  if (Math.abs(days) < RELATIVE_DAYS_LIMIT) return formatRelativeDays(days);
  return formatDate(date, { ...options, now });
}

export type Deadline = {
  /** Calendar days from today to the deadline day: 0 — today, < 0 — passed. */
  daysLeft: number;
  /** The deadline day is over; during the day itself it isn't yet. */
  isOverdue: boolean;
  /** The deadline day, `25 октября`; the UI adds «до». */
  date: string;
  /** `через 16 дней`, `завтра`, `сегодня`, `вчера`, `3 дня назад`. */
  relative: string;
};

/**
 * A deadline is a whole calendar day in the shelter time zone: the day that
 * `deadline` falls on, whichever moment of it was stored.
 */
export function describeDeadline(
  deadline: Date,
  options: DateOptions,
): Deadline {
  const withNow = { ...options, now: options.now ?? new Date() };
  const daysLeft = daysFromToday(deadline, withNow);
  return {
    daysLeft,
    isOverdue: daysLeft < 0,
    date: formatDate(deadline, withNow),
    relative: formatRelativeDays(daysLeft),
  };
}
