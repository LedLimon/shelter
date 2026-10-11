// Helpers: money, plurals, dates, icons. The app has the same ones in src/lib
// (formatRub, plural, formatDate…); these are small copies for the prototype.

const NBSP = "\u00a0";

const ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes text typed by the viewer (admin forms) before it goes into markup. */
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

/** Roubles to kopecks: money is kept in whole kopecks, as in the app. */
function rub(roubles) {
  return Math.round(roubles * 100);
}

function groupThousands(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** 250000 → «2 500 ₽», 145050 → «1 450,50 ₽». */
function formatRub(kop, { sign = false } = {}) {
  const abs = Math.abs(kop);
  const whole = Math.floor(abs / 100);
  const rest = abs % 100;
  const body =
    groupThousands(whole) + (rest ? `,${String(rest).padStart(2, "0")}` : "");
  const prefix = kop < 0 ? "−" : sign ? "+" : "";
  return `${prefix}${body}${NBSP}₽`;
}

/** «1 500» or «1500,50» from an input → kopecks, or null. */
function parseRubInput(text) {
  const clean = String(text ?? "")
    .replace(/[\s₽]/g, "")
    .replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

/** plural(5, ["собака", "собаки", "собак"]) → «собак». */
function plural(n, forms) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

function formatCount(n, forms) {
  return `${groupThousands(n)}${NBSP}${plural(n, forms)}`;
}

const MONTHS_GEN = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

const pad2 = (n) => String(n).padStart(2, "0");

/** «8 октября». */
function formatDate(date) {
  return `${date.getDate()}${NBSP}${MONTHS_GEN[date.getMonth()]}`;
}

/** «08.10» — the date column of the ledger. */
function formatDay(date) {
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}`;
}

function formatTime(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** «12 минут назад», «2 часа назад», «вчера», «3 дня назад». */
function formatRelative(date, now) {
  const minutes = Math.round((now - date) / 60000);
  if (minutes < 1) return "только что";
  if (minutes < 60)
    return `${formatCount(minutes, ["минуту", "минуты", "минут"])} назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24 && date.getDate() === now.getDate())
    return `${formatCount(hours, ["час", "часа", "часов"])} назад`;
  const days = Math.max(
    1,
    Math.round(
      (new Date(now.getFullYear(), now.getMonth(), now.getDate()) -
        new Date(date.getFullYear(), date.getMonth(), date.getDate())) /
        86400000,
    ),
  );
  if (days === 1) return "вчера";
  return `${formatCount(days, ["день", "дня", "дней"])} назад`;
}

function describeDeadline(date) {
  return date ? `до ${formatDate(date)}` : "без срока";
}

/** How long a dog has been waiting: «4 года», «11 месяцев». */
function formatDuration(months) {
  if (months >= 24) {
    const years = Math.floor(months / 12);
    return formatCount(years, ["год", "года", "лет"]);
  }
  return formatCount(months, ["месяц", "месяца", "месяцев"]);
}

function monthsBetween(from, to) {
  return (
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth())
  );
}

/** Inline lucide icon; decorative unless a label is given. */
function icon(name, label) {
  const body = ICONS[name] ?? ICONS["circle-alert"];
  const a11y = label
    ? `role="img" aria-label="${esc(label)}"`
    : 'aria-hidden="true"';
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${body}</svg>`;
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
