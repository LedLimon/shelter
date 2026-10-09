import {
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock,
  Info,
  Minus,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { formatRub } from "@/lib/money";
import { cn } from "@/lib/utils";

import { Paper, Section, SpecLabel } from "../showcase";
import { ContrastTable } from "../tokens/contrast-table";
import { PaletteSpecimen } from "../tokens/palette-specimen";

// Design tokens of DS-1 (src/app/globals.css), moved here from /dev/tokens.

const TYPE_SCALE: { token: string; size: string; sample: ReactNode }[] = [
  {
    token: "text-hero",
    size: "46 → 84 px",
    sample: (
      <p className="font-display text-hero">Операция на лапе для Бурана</p>
    ),
  },
  {
    token: "text-section",
    size: "30 → 44 px, капс",
    sample: <p className="font-display text-section uppercase">Срочно нужно</p>,
  },
  {
    token: "text-title",
    size: "30 px",
    sample: (
      <p className="font-display text-title">Утеплить шесть будок к зиме</p>
    ),
  },
  {
    token: "text-name",
    size: "40 px, капс, 1000",
    sample: <p className="font-display text-name uppercase">Буран</p>,
  },
  {
    token: "text-sum-lg · text-sum",
    size: "36 и 28 px, tabular-nums",
    sample: (
      <p className="flex flex-wrap items-baseline gap-x-4 font-display tabular-nums">
        <span className="text-sum-lg">{formatRub(24_650_00)}</span>
        <span className="text-sum">{formatRub(2_500_00)}</span>
      </p>
    ),
  },
  {
    token: "text-button",
    size: "22 px, капс",
    sample: <p className="font-display text-button uppercase">Помочь Бурану</p>,
  },
  {
    token: "text-label",
    size: "14 px, капс, разрядка",
    sample: (
      <p className="font-display text-label uppercase">Ждут дом · Корм</p>
    ),
  },
  {
    token: "text-body",
    size: "16 px / 1,55",
    sample: (
      <p className="max-w-prose text-body">
        Буран три недели ходит на трёх лапах: перелом сросся неправильно. Хирург
        готов оперировать 21&nbsp;октября. Каждые {formatRub(1_000_00)} — сутки
        в&nbsp;стационаре после операции. Ёлочки «»&nbsp;и&nbsp;№&nbsp;17
        на&nbsp;месте.
      </p>
    ),
  },
  {
    token: "text-caption",
    size: "14 px",
    sample: (
      <p className="text-caption text-toner-muted">
        из {formatRub(38_000_00)} · осталось {formatRub(13_350_00)}
      </p>
    ),
  },
  {
    token: "text-mono · text-mono-sm",
    size: "12,5 и 11 px",
    sample: (
      <p className="flex flex-wrap gap-x-4 font-mono">
        <span className="text-mono">{formatRub(13_350_00)} весь остаток</span>
        <span className="text-mono-sm text-toner-muted">
          Лекарства и ветеринария · до 20 октября
        </span>
      </p>
    ),
  },
];

const FAMILIES = [
  {
    className: "font-display text-sum",
    name: "Sofia Sans Extra Condensed",
    role: "Заголовки, суммы, клички, метки, кнопки",
  },
  {
    className: "font-body text-body",
    name: "Literata",
    role: "Описания, истории, отчёты",
  },
  {
    className: "font-mono text-mono",
    name: "Martian Mono",
    role: "Язычки, даты, категории, номера операций",
  },
];

const URGENCY: {
  className: string;
  label: string;
  icon: LucideIcon;
  how: string;
}[] = [
  {
    className: "urgency-critical",
    label: "Критично",
    icon: CircleAlert,
    how: "залитая плашка тонера",
  },
  {
    className: "urgency-high",
    label: "Высокая",
    icon: TriangleAlert,
    how: "рамка 2 px",
  },
  {
    className: "urgency-normal",
    label: "Обычная",
    icon: Clock,
    how: "рамка 1 px",
  },
  { className: "urgency-low", label: "Низкая", icon: Minus, how: "пунктир" },
];

const STATES: {
  className: string;
  label: string;
  icon: LucideIcon;
  text: string;
}[] = [
  {
    className: "text-success",
    label: "Успех",
    icon: CircleCheck,
    text: "Спасибо! Платёж прошёл, чек придёт на почту.",
  },
  {
    className: "text-danger",
    label: "Ошибка",
    icon: CircleX,
    text: "Платёж не прошёл. Попробуйте другую карту или СБП.",
  },
  {
    className: "text-warning",
    label: "Предупреждение",
    icon: TriangleAlert,
    text: "Похоже на опечатку в адресе почты: gmial.com.",
  },
  {
    className: "text-info",
    label: "Инфо",
    icon: Info,
    text: "Чек пришлём на эту почту, больше писем не будет.",
  },
];

const SPACING = [
  {
    token: "gutter",
    className: "w-gutter",
    value: "16 → 48 px",
    use: "Поля страницы",
  },
  {
    token: "grid",
    className: "w-grid",
    value: "18 → 28 px",
    use: "Между листами",
  },
  {
    token: "sheet",
    className: "w-sheet",
    value: "16 → 24 px",
    use: "Внутри большого листа",
  },
  {
    token: "card",
    className: "w-card",
    value: "12 px",
    use: "Внутри карточки",
  },
  {
    token: "section",
    className: "w-section",
    value: "36 → 56 px",
    use: "Между секциями",
  },
  { token: "cta", className: "w-cta", value: "52 px", use: "Высота «Помочь»" },
  {
    token: "tab",
    className: "w-tab",
    value: "56 px",
    use: "Мин. высота язычка",
  },
];

export function TokenSections() {
  return (
    <>
      <Section id="palette" title="Палитра">
        <PaletteSpecimen />
      </Section>

      <Section id="contrast" title="Контраст">
        <Paper className="grid gap-3">
          <p className="max-w-prose text-caption text-toner-muted">
            Порог WCAG 2.1 AA: 4,5:1 для текста, 3:1 для рамок, фокуса
            и&nbsp;штриховки. Значения для текущей темы; обе темы проверяет тест{" "}
            <code className="font-mono text-mono-sm whitespace-nowrap">
              design-tokens.test.ts
            </code>
            .
          </p>
          <ContrastTable />
        </Paper>
      </Section>

      <Section id="type" title="Шрифты">
        <div className="grid gap-grid md:grid-cols-3">
          {FAMILIES.map(({ className, name, role }) => (
            <Paper key={name} className="grid content-start gap-2">
              <p className={className}>{name}</p>
              <p className="text-caption text-toner-muted">{role}</p>
              <p className={cn(className, "tabular-nums")}>
                Ёё «» — № ₽ 0123456789
              </p>
            </Paper>
          ))}
        </div>
        <Paper>
          <dl className="grid">
            {TYPE_SCALE.map(({ token, size, sample }) => (
              <div
                key={token}
                className="grid gap-2 border-b border-dashed py-4 first:pt-0 last:border-b-0 last:pb-0 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-6"
              >
                <dt className="font-mono text-mono-sm">
                  <span className="block">{token}</span>
                  <span className="block text-toner-muted">{size}</span>
                </dt>
                <dd className="min-w-0">{sample}</dd>
              </div>
            ))}
          </dl>
        </Paper>
      </Section>

      <Section id="shapes" title="Формы">
        <div className="grid gap-grid md:grid-cols-2">
          <Paper className="grid content-start gap-5">
            <div className="grid gap-2">
              <SpecLabel>border · рамка фото 1 px</SpecLabel>
              <div className="grid aspect-[4/3] max-w-64 place-items-center border border-toner bg-board font-mono text-mono-sm text-toner-muted">
                фото 4:3
              </div>
            </div>
            <div className="grid gap-2">
              <SpecLabel>border-line · коробка прогресса 1,5 px</SpecLabel>
              <div className="h-[1.125rem] border-line border-toner p-[3px]">
                <div className="h-full w-[64%] border-r-2 border-pen bg-[repeating-linear-gradient(-55deg,var(--color-pen)_0_1.6px,transparent_1.6px_5px)]" />
              </div>
            </div>
            <div className="grid gap-2">
              <SpecLabel>
                border-line border-dashed · перфорация 1,5 px
              </SpecLabel>
              <div className="border-t-line border-dashed border-perforation" />
            </div>
          </Paper>
          <Paper className="grid content-start gap-5">
            <div className="grid gap-2">
              <SpecLabel>shadow-sheet · rounded-sheet 1 px</SpecLabel>
              <p className="max-w-prose text-caption">
                Каждый лист на этой странице&nbsp;— бумага с&nbsp;одной тенью
                «лист на&nbsp;доске». Других теней и&nbsp;скруглений нет.
              </p>
            </div>
            <div className="grid gap-3">
              <SpecLabel>rounded-stamp 4 px · наклон 4°</SpecLabel>
              <p className="-rotate-4 justify-self-start rounded-stamp px-2.5 py-0.5 font-display text-title text-pen uppercase ring-[2.5px] ring-pen ring-inset">
                Собрано
              </p>
            </div>
          </Paper>
        </div>
      </Section>

      <Section id="urgency" title="Срочность и состояния">
        <div className="grid gap-grid md:grid-cols-2">
          <Paper className="grid content-start gap-4">
            <ul className="flex flex-wrap gap-3">
              {URGENCY.map(({ className, label, icon: Icon, how }) => (
                <li key={label} className="grid justify-items-start gap-1.5">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 py-0.5 pr-2 pl-1.5 font-display text-label uppercase",
                      className,
                    )}
                  >
                    <Icon aria-hidden className="size-3.5" />
                    {label}
                  </span>
                  <span className="font-mono text-mono-sm text-toner-muted">
                    {className} · {how}
                  </span>
                </li>
              ))}
            </ul>
            <p className="max-w-prose text-caption text-toner-muted">
              Цвет срочность не передаёт: только плашка, рамка или пунктир,
              иконка и&nbsp;слово.
            </p>
          </Paper>
          <Paper className="grid content-start gap-3">
            <SpecLabel>
              Чернила состояний форм: success, danger, warning, info
            </SpecLabel>
            <ul className="grid gap-2.5">
              {STATES.map(({ className, label, icon: Icon, text }) => (
                <li
                  key={label}
                  className={cn(
                    "flex items-start gap-2 text-caption",
                    className,
                  )}
                >
                  <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <b className="font-display text-label uppercase">
                      {label}.
                    </b>{" "}
                    {text}
                  </span>
                </li>
              ))}
            </ul>
          </Paper>
        </div>
      </Section>

      <Section id="surfaces" title="Поверхности">
        <div className="grid gap-grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-3 rounded-sheet surface-notice p-sheet shadow-sheet">
            <h3 className="text-title">Сегодня помогли</h3>
            <ul className="grid gap-2">
              {(
                [
                  ["Анна", 1_000_00, "12 минут назад"],
                  ["Аноним", 500_00, "40 минут назад"],
                  ["Сергей", 3_000_00, "2 часа назад"],
                ] as const
              ).map(([name, kop, when]) => (
                <li
                  key={name}
                  className="flex justify-between gap-3 border-b border-dotted pb-1.5"
                >
                  <b className="tabular-nums">
                    {name}&nbsp;— {formatRub(kop)}
                  </b>
                  <span className="text-caption text-muted-foreground">
                    {when}
                  </span>
                </li>
              ))}
            </ul>
            <a
              href="#surfaces"
              className="justify-self-start text-pen underline"
            >
              Все пожертвования и&nbsp;чеки
            </a>
            <SpecLabel>surface-notice</SpecLabel>
          </div>
          <div className="grid content-start gap-3 rounded-sheet surface-footer p-sheet">
            <p className="font-display text-title">Подвал</p>
            <p className="text-caption text-muted-foreground">
              Реквизиты, документы и&nbsp;контакты. Вторичный текст&nbsp;—
              отдельный токен: ручка и&nbsp;бледный тонер здесь не&nbsp;проходят
              AA.
            </p>
            <a
              href="#surfaces"
              className="justify-self-start text-pen underline"
            >
              Политика обработки персональных данных
            </a>
            <SpecLabel>surface-footer</SpecLabel>
          </div>
        </div>
      </Section>

      <Section id="spacing" title="Отступы">
        <Paper>
          <dl className="grid">
            {SPACING.map(({ token, className, value, use }) => (
              <div
                key={token}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-dashed py-2.5 first:pt-0 last:border-b-0 last:pb-0 md:grid-cols-[12rem_minmax(0,1fr)_auto]"
              >
                <dt className="font-mono text-mono-sm">
                  <span className="block">{token}</span>
                  <span className="block text-toner-muted">{use}</span>
                </dt>
                <dd className="order-last col-span-full md:order-none md:col-span-1">
                  <span
                    aria-hidden
                    className={cn("block h-3 bg-toner-muted", className)}
                  />
                </dd>
                <dd className="font-mono text-mono-sm text-toner-muted">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </Paper>
      </Section>
    </>
  );
}
