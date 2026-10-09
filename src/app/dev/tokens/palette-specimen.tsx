"use client";

import type { ColorToken } from "@/lib/design-tokens";

import { useTokenColors } from "./use-token-colors";

type Swatch = { token: ColorToken; name: string; use: string };

const GROUPS: { title: string; swatches: Swatch[] }[] = [
  {
    title: "Основа",
    swatches: [
      { token: "board", name: "Доска", use: "Фон страницы" },
      { token: "paper", name: "Бумага", use: "Листы, шапка, формы, шторки" },
      { token: "toner", name: "Тонер", use: "Текст, рамки, плашка «Критично»" },
      {
        token: "toner-muted",
        name: "Бледный тонер",
        use: "Вторичный текст, даты",
      },
      {
        token: "pen",
        name: "Шариковая ручка",
        use: "Ссылки, штриховка, фокус, штамп",
      },
      {
        token: "notice",
        name: "Жёлтая бумага",
        use: "Только «Помочь» и «Сегодня помогли»",
      },
      {
        token: "perforation",
        name: "Перфорация",
        use: "Пунктир язычков, разделители",
      },
      { token: "footer", name: "Подвал", use: "Полоса подвала" },
    ],
  },
  {
    title: "На жёлтом листе и в подвале",
    swatches: [
      {
        token: "notice-foreground",
        name: "Текст на жёлтом",
        use: "Текст, ссылки, фокус",
      },
      {
        token: "notice-muted",
        name: "Вторичный на жёлтом",
        use: "Время, подписи",
      },
      {
        token: "footer-foreground",
        name: "Текст подвала",
        use: "Текст, ссылки, фокус",
      },
      {
        token: "footer-muted",
        name: "Вторичный в подвале",
        use: "Реквизиты, подписи",
      },
    ],
  },
  {
    title: "Состояния форм",
    swatches: [
      { token: "success", name: "Успех", use: "Сохранено, платёж прошёл" },
      { token: "danger", name: "Ошибка", use: "Ошибки полей и платежа" },
      { token: "warning", name: "Предупреждение", use: "Проверьте данные" },
      { token: "info", name: "Инфо", use: "Подсказки (= ручка)" },
      {
        token: "scrim",
        name: "Затемнение",
        use: "Под диалогом, с прозрачностью",
      },
    ],
  },
];

export function PaletteSpecimen() {
  const colors = useTokenColors();

  return (
    <div className="grid gap-grid md:grid-cols-2">
      {GROUPS.map(({ title, swatches }) => (
        <section
          key={title}
          aria-label={title}
          className="rounded-sheet bg-paper p-sheet shadow-sheet md:first:row-span-2"
        >
          <h3 className="text-title">{title}</h3>
          <ul className="mt-4">
            {swatches.map(({ token, name, use }) => (
              <li
                key={token}
                className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-3 border-b border-dashed py-2.5 last:border-b-0"
              >
                <span
                  aria-hidden
                  className="size-14 border border-toner"
                  style={{ backgroundColor: `var(--color-${token})` }}
                />
                <span className="min-w-0">
                  <span className="block font-display text-label uppercase">
                    {name}
                  </span>
                  <span className="block text-caption text-toner-muted">
                    {use}
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-x-2 font-mono text-mono-sm">
                    <span className="text-toner-muted">--color-{token}</span>
                    <span className="uppercase">{colors?.[token] ?? "…"}</span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
