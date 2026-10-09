---
name: Сайт приюта
description: Сайт одного собачьего приюта — нужды, прозрачность, собаки
colors:
  board: "#D1D5D6"
  paper: "#FBFBF7"
  toner: "#161617"
  toner-muted: "#55575B"
  pen: "#2244B0"
  notice: "#FFE04A"
  notice-foreground: "#161617"
  notice-muted: "#504824"
  perforation: "#8A8D90"
  footer: "#161617"
  footer-foreground: "#FBFBF7"
  footer-muted: "#BBBBB8"
  success: "#205E2E"
  danger: "#9A2925"
  warning: "#7B4606"
  info: "#2244B0"
  scrim: "#161617"
  board-dark: "#121315"
  paper-dark: "#212224"
  toner-dark: "#ECEBE6"
  toner-muted-dark: "#A7A7A1"
  pen-dark: "#9DB2FF"
  notice-dark: "#F3D23C"
  notice-foreground-dark: "#161617"
  notice-muted-dark: "#4D4520"
  perforation-dark: "#6B6D70"
  footer-dark: "#2B2C2E"
  footer-foreground-dark: "#ECEBE6"
  footer-muted-dark: "#B6B5B2"
  success-dark: "#95C69B"
  danger-dark: "#FB988D"
  warning-dark: "#DDAC82"
  info-dark: "#9DB2FF"
  scrim-dark: "#121315"
typography:
  display:
    fontFamily: "Sofia Sans Extra Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(2.875rem, 1.891rem + 4.199vw, 5.25rem)"
    fontWeight: 900
    lineHeight: 0.92
  headline:
    fontFamily: "Sofia Sans Extra Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(1.875rem, 1.512rem + 1.547vw, 2.75rem)"
    fontWeight: 900
    lineHeight: 0.92
  title:
    fontFamily: "Sofia Sans Extra Condensed, Arial Narrow, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 900
    lineHeight: 0.95
  name:
    fontFamily: "Sofia Sans Extra Condensed, Arial Narrow, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 1000
    lineHeight: 0.85
  sum:
    fontFamily: "Sofia Sans Extra Condensed, Arial Narrow, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 900
    lineHeight: 1
    fontFeature: "tnum"
  sum-lg:
    fontFamily: "Sofia Sans Extra Condensed, Arial Narrow, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 900
    lineHeight: 1
    fontFeature: "tnum"
  button:
    fontFamily: "Sofia Sans Extra Condensed, Arial Narrow, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "0.03em"
  label:
    fontFamily: "Sofia Sans Extra Condensed, Arial Narrow, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "0.06em"
  body:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  caption:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
  mono:
    fontFamily: "Martian Mono, ui-monospace, monospace"
    fontSize: "0.78125rem"
    fontWeight: 400
    lineHeight: 1.3
  mono-sm:
    fontFamily: "Martian Mono, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.3
rounded:
  none: "0px"
  sheet: "1px"
  stamp: "4px"
spacing:
  gutter: "16px"
  gutter-desktop: "48px"
  grid: "18px"
  grid-desktop: "28px"
  sheet: "16px"
  sheet-desktop: "24px"
  card: "12px"
  section: "36px"
  section-desktop: "56px"
  tab: "56px"
  cta: "52px"
components:
  button-help:
    backgroundColor: "{colors.notice}"
    textColor: "{colors.notice-foreground}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    height: "{spacing.cta}"
    padding: "0 24px"
  button-primary:
    backgroundColor: "{colors.toner}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    height: "44px"
    padding: "0 16px"
  sheet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.toner}"
    rounded: "{rounded.sheet}"
    padding: "{spacing.sheet}"
  sheet-notice:
    backgroundColor: "{colors.notice}"
    textColor: "{colors.notice-foreground}"
    rounded: "{rounded.sheet}"
    padding: "{spacing.sheet}"
  footer:
    backgroundColor: "{colors.footer}"
    textColor: "{colors.footer-foreground}"
    padding: "{spacing.sheet}"
  urgency-critical:
    backgroundColor: "{colors.toner}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.toner}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    height: "44px"
    padding: "0 12px"
---

# Design System: Сайт приюта

> Визуальная система для дизайн-скилла Impeccable. **Источник правды — [docs/design.md](docs/design.md#визуальный-стиль)**: палитра, контраст, шрифты, токены в коде, пропорции фото, запреты. Решение и альтернативы — [ADR-0006](docs/adr/0006-visual-direction.md). Токены во frontmatter — копия `src/app/globals.css` для Impeccable (суффикс `-dark` — тёмная тема, `-desktop` — значение от 768 px); цвета сверяет с кодом тест `src/lib/design-tokens.test.ts`. Правила здесь не повторяются: при расхождении прав `docs/design.md`. Заголовки — на английском: по ним файл разбирает Impeccable.

## Overview

**Creative North Star: «Объявление на доске у подъезда»**

Каждая нужда и каждая собака — лист бумаги на серой доске: фото с телефона, короткий текст, отрывные язычки внизу. Помогают, отрывая язычок: у нужды язычки — суммы доната, у собаки — «Хочу забрать». Вёрстка чистая и честная, без бутафории: ни скотча, ни кнопок, ни поворотов. Тон соседский и прямой.

**Key Characteristics:**

- Доска — фон, бумага — все поверхности, тонер — текст, синяя ручка — ссылки и отметки, жёлтая бумага — только главное действие.
- Сжатый гротеск для заголовков, книжная антиква для текста, моноширинный для язычков и дат.
- Signature — отрывные язычки, всегда как действие.

## Colors

Роли: доска (фон), бумага (поверхности), тонер (текст и рамки), бледный тонер (вторичный текст), шариковая ручка (ссылки, штриховка прогресса, штамп «Собрано», фокус), жёлтая бумага (кнопка «Помочь»), перфорация (пунктир), подвал. Значения для светлой и тёмной темы и таблица контраста — [docs/design.md#палитра](docs/design.md#палитра).

**The One Yellow Rule.** Жёлтая бумага — только кнопка «Помочь» и один лист «Сегодня помогли» на экране. У жёлтой кнопки всегда рамка тонером. На жёлтом и в подвале ссылки и фокус — цветом текста поверхности.

**The Pen Rule.** Всё, что отмечает человек — ссылки, штриховка, крестики, штамп, — синей ручкой. Срочность цветом не передаётся.

## Typography

**Display Font:** Sofia Sans Extra Condensed · **Body Font:** Literata · **Label Font:** Martian Mono. Шкала и правила — [docs/design.md#шрифты](docs/design.md#шрифты).

**The Short Caps Rule.** Капс — только короткие метки и клички. Длинные заголовки — в обычном регистре.

## Layout

Mobile-first: один столбец листов на доске; на десктопе — сетка листов, hero и узкий жёлтый лист рядом. Порядок блоков, сетка и размеры — [docs/design.md#главная-страница](docs/design.md#главная-страница), композиция первого экрана — `.impeccable/surfaces/src-app-page-tsx.md`.

## Elevation & Depth

Одна тень — «лист на доске», мягкая и со смещением вниз. Глубина больше нигде не используется: доска плоская, листы не поворачиваются.

## Shapes

Бумага почти не скругляется. Фото и прогресс «напечатаны» в рамках тонера, язычки отделены пунктиром перфорации. Скругление и наклон есть только у штампов «Собрано» и «Дома».

## Components

Базовые компоненты shadcn/ui стилизует DS-2, доменные (`NeedCard`, `DogCard`, `TearTabs`, `UrgencyBadge`) — DS-3; их назначение — [docs/design.md#компоненты-дизайн-системы](docs/design.md#компоненты-дизайн-системы). Токены и утилиты, из которых они собираются (поверхности `surface-notice` и `surface-footer`, рамки срочности `urgency-*`, тень `shadow-sheet`), — [docs/design.md#токены-в-коде](docs/design.md#токены-в-коде). Витрина в dev — `/dev/tokens`.

**The Bordered Yellow Rule.** Кнопка «Помочь» — жёлтая бумага с рамкой 2 px цветом `notice-foreground` в обеих темах: без рамки жёлтый на бумаге — 1,26:1.

## Do's and Don'ts

### Do:

- **Do** ставить язычки с суммами по нижнему краю листа нужды и «Хочу забрать» — у листа собаки.
- **Do** держать пропорции фото из `docs/design.md#фото` и печатать фото в рамку.
- **Do** показывать срочность плашкой, рамкой или пунктиром вместе с иконкой и словом.

### Don't:

- **Don't** добавлять скотч, канцелярские кнопки, повороты, текстуры бумаги и рукописные шрифты.
- **Don't** использовать жёлтый вне кнопки «Помочь» и листа «Сегодня помогли».
- **Don't** ставить язычки, которые ничего не делают.
