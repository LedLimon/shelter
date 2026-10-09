import { AA_TEXT, AA_UI } from "@/lib/contrast";

/**
 * Colour tokens of the «Объявление» direction. Each one is a CSS variable
 * `--color-<name>` from src/app/globals.css and a Tailwind colour
 * (`bg-paper`, `text-pen`, …). Values and roles: docs/design.md#палитра.
 */
export const COLOR_TOKENS = [
  "board",
  "paper",
  "toner",
  "toner-muted",
  "pen",
  "notice",
  "notice-foreground",
  "notice-muted",
  "perforation",
  "footer",
  "footer-foreground",
  "footer-muted",
  "success",
  "danger",
  "warning",
  "info",
  "scrim",
] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];

export type ContrastPair = {
  /** Row label in the contrast table of docs/design.md. */
  label: string;
  foreground: ColorToken;
  background: ColorToken;
  /** WCAG threshold the pair must meet in both themes. */
  min: typeof AA_TEXT | typeof AA_UI;
};

/**
 * Every text/background and UI/background pair the direction uses.
 * design-tokens.test.ts checks them against globals.css and docs/design.md.
 */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  {
    label: "Основной текст на бумаге",
    foreground: "toner",
    background: "paper",
    min: AA_TEXT,
  },
  {
    label: "Основной текст на доске",
    foreground: "toner",
    background: "board",
    min: AA_TEXT,
  },
  {
    label: "Вторичный текст на бумаге",
    foreground: "toner-muted",
    background: "paper",
    min: AA_TEXT,
  },
  {
    label: "Вторичный текст на доске",
    foreground: "toner-muted",
    background: "board",
    min: AA_TEXT,
  },
  {
    label: "Ссылка (ручка) на бумаге",
    foreground: "pen",
    background: "paper",
    min: AA_TEXT,
  },
  {
    label: "Ссылка (ручка) на доске",
    foreground: "pen",
    background: "board",
    min: AA_TEXT,
  },
  {
    label: "Бумага на тонере: кнопка, плашка «Критично»",
    foreground: "paper",
    background: "toner",
    min: AA_TEXT,
  },
  {
    label: "Выделение текста: бумага на ручке",
    foreground: "paper",
    background: "pen",
    min: AA_TEXT,
  },
  {
    label: "Текст кнопки «Помочь» на жёлтой",
    foreground: "notice-foreground",
    background: "notice",
    min: AA_TEXT,
  },
  {
    label: "Вторичный текст на жёлтом листе",
    foreground: "notice-muted",
    background: "notice",
    min: AA_TEXT,
  },
  {
    label: "Текст, ссылка и фокус в подвале",
    foreground: "footer-foreground",
    background: "footer",
    min: AA_TEXT,
  },
  {
    label: "Вторичный текст в подвале",
    foreground: "footer-muted",
    background: "footer",
    min: AA_TEXT,
  },
  {
    label: "Успех на бумаге",
    foreground: "success",
    background: "paper",
    min: AA_TEXT,
  },
  {
    label: "Успех на доске",
    foreground: "success",
    background: "board",
    min: AA_TEXT,
  },
  {
    label: "Ошибка на бумаге",
    foreground: "danger",
    background: "paper",
    min: AA_TEXT,
  },
  {
    label: "Ошибка на доске",
    foreground: "danger",
    background: "board",
    min: AA_TEXT,
  },
  {
    label: "Предупреждение на бумаге",
    foreground: "warning",
    background: "paper",
    min: AA_TEXT,
  },
  {
    label: "Предупреждение на доске",
    foreground: "warning",
    background: "board",
    min: AA_TEXT,
  },
  {
    label: "Инфо на бумаге",
    foreground: "info",
    background: "paper",
    min: AA_TEXT,
  },
  {
    label: "Инфо на доске",
    foreground: "info",
    background: "board",
    min: AA_TEXT,
  },
  {
    label: "Штриховка прогресса, кольцо фокуса на бумаге (UI)",
    foreground: "pen",
    background: "paper",
    min: AA_UI,
  },
  {
    label: "Кольцо фокуса на доске (UI)",
    foreground: "pen",
    background: "board",
    min: AA_UI,
  },
  {
    label: "Перфорация, рамки полей на бумаге (UI)",
    foreground: "perforation",
    background: "paper",
    min: AA_UI,
  },
  {
    label: "Рамка тонером на бумаге: фото, прогресс (UI)",
    foreground: "toner",
    background: "paper",
    min: AA_UI,
  },
  {
    label: "Ссылка и фокус на жёлтом (цвет текста, UI)",
    foreground: "notice-foreground",
    background: "notice",
    min: AA_UI,
  },
];

/**
 * Pairs that fail on purpose and are documented as such: the design never
 * uses them without a compensating border or surface rule.
 */
export const KNOWN_LOW_CONTRAST_PAIRS: readonly (Omit<ContrastPair, "min"> & {
  /** How the design avoids the pair. */
  note: string;
})[] = [
  {
    label: "Жёлтая кнопка на бумаге без рамки (UI)",
    foreground: "notice",
    background: "paper",
    note: "только с рамкой 2 px",
  },
  {
    label: "Перфорация на доске (UI)",
    foreground: "perforation",
    background: "board",
    note: "только на бумаге",
  },
];
