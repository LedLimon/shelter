/** Whether the runtime knows the IANA time zone: `Europe/Moscow`. */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * The time zones of Russia, one per UTC offset, west to east. The shelter's
 * zone only decides how dates are shown, so the largest city of each offset
 * is enough.
 */
export const RUSSIAN_TIME_ZONES = [
  { value: "Europe/Kaliningrad", city: "Калининград" },
  { value: "Europe/Moscow", city: "Москва" },
  { value: "Europe/Samara", city: "Самара" },
  { value: "Asia/Yekaterinburg", city: "Екатеринбург" },
  { value: "Asia/Omsk", city: "Омск" },
  { value: "Asia/Krasnoyarsk", city: "Красноярск" },
  { value: "Asia/Irkutsk", city: "Иркутск" },
  { value: "Asia/Yakutsk", city: "Якутск" },
  { value: "Asia/Vladivostok", city: "Владивосток" },
  { value: "Asia/Magadan", city: "Магадан" },
  { value: "Asia/Kamchatka", city: "Петропавловск-Камчатский" },
] as const;

/** The zone's offset at the given moment: `UTC+3`, `UTC+5:30`, `UTC−8`. */
export function utcOffset(timeZone: string, at: Date): string {
  const offset = new Intl.DateTimeFormat("en", {
    timeZone,
    timeZoneName: "shortOffset",
  })
    .formatToParts(at)
    .find(({ type }) => type === "timeZoneName")?.value;
  // "GMT+3"; for UTC itself "GMT" or "GMT+0", depending on the ICU version.
  const shift = (offset ?? "GMT").replace("GMT", "").replace("-", "−");
  return `UTC${shift || "+0"}`;
}

/**
 * Options of a time zone select: the Russian zones with their offsets, plus
 * the current value if it is none of them (a shelter set up for another
 * country keeps its zone).
 */
export function timeZoneOptions(
  current: string,
  at: Date,
): { value: string; label: string }[] {
  const options = RUSSIAN_TIME_ZONES.map(({ value, city }) => ({
    value,
    label: `${city} (${utcOffset(value, at)})`,
  }));
  if (options.some(({ value }) => value === current) || !isTimeZone(current)) {
    return options;
  }
  return [
    { value: current, label: `${current} (${utcOffset(current, at)})` },
    ...options,
  ];
}
