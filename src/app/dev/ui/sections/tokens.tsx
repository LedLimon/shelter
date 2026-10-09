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
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { assertDevelopment } from "../dev-only";
import { ContrastTable } from "./contrast-table";
import { PaletteSpecimen } from "./palette-specimen";

// Metadata is resolved alongside the page, so it needs the same guard.
export function generateMetadata(): Metadata {
  assertDevelopment();
  return { title: "Токены «Объявление»" };
}

// Temporary DS-1 showcase; DS-2 moves it into /dev/ui.

const NBSP = "\u00a0";

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
        <span className="text-sum-lg">{`24${NBSP}650${NBSP}₽`}</span>
        <span className="text-sum">{`2${NBSP}500${NBSP}₽`}</span>
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
        готов оперировать 21&nbsp;октября. Каждые 1&nbsp;000&nbsp;₽ — сутки
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
        из 38&nbsp;000&nbsp;₽ · осталось 13&nbsp;350&nbsp;₽
      </p>
    ),
  },
  {
    token: "text-mono · text-mono-sm",
    size: "12,5 и 11 px",
    sample: (
      <p className="flex flex-wrap gap-x-4 font-mono">
        <span className="text-mono">13&nbsp;350&nbsp;₽ весь остаток</span>
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

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="grid grid-cols-[minmax(0,1fr)] gap-grid"
    >
      <h2
        id={id}
        className="justify-self-start bg-paper px-3.5 pt-2 pb-1.5 text-section uppercase shadow-sheet"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Sheet({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("rounded-sheet bg-paper p-sheet shadow-sheet", className)}
    >
      {children}
    </div>
  );
}

function SpecLabel({ children }: { children: ReactNode }) {
  return <p className="font-mono text-mono-sm text-toner-muted">{children}</p>;
}

export default function TokensPage() {
  assertDevelopment();
  return (
    <main className="mx-auto grid max-w-[80rem] grid-cols-[minmax(0,1fr)] gap-section px-gutter py-section">
      <header className="grid gap-sheet rounded-sheet bg-paper p-sheet shadow-sheet md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="grid gap-3">
          <h1 className="text-hero">Токены «Объявление»</h1>
          <p className="max-w-prose">
            Временная витрина DS-1, только в&nbsp;development: палитра, шрифты,
            формы и&nbsp;темы из&nbsp;
            <code className="font-mono text-mono">src/app/globals.css</code>.
            Цвета и&nbsp;контраст ниже читаются из&nbsp;CSS в&nbsp;браузере,
            поэтому показывают то, что действительно в&nbsp;коде. Правила
            и&nbsp;запреты&nbsp;— в&nbsp;
            <code className="font-mono text-mono">docs/design.md</code>.
          </p>
        </div>
        <ThemeSwitcher className="md:w-[26rem]" />
      </header>

      <Section id="palette" title="Палитра">
        <PaletteSpecimen />
      </Section>

      <Section id="contrast" title="Контраст">
        <Sheet className="grid gap-3">
          <p className="max-w-prose text-caption text-toner-muted">
            Порог WCAG 2.1 AA: 4,5:1 для текста, 3:1 для рамок, фокуса
            и&nbsp;штриховки. Значения для текущей темы; обе темы проверяет тест{" "}
            <code className="font-mono text-mono-sm whitespace-nowrap">
              design-tokens.test.ts
            </code>
            .
          </p>
          <ContrastTable />
        </Sheet>
      </Section>

      <Section id="type" title="Шрифты">
        <div className="grid gap-grid md:grid-cols-3">
          {FAMILIES.map(({ className, name, role }) => (
            <Sheet key={name} className="grid content-start gap-2">
              <p className={className}>{name}</p>
              <p className="text-caption text-toner-muted">{role}</p>
              <p className={cn(className, "tabular-nums")}>
                Ёё «» — № ₽ 0123456789
              </p>
            </Sheet>
          ))}
        </div>
        <Sheet>
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
        </Sheet>
      </Section>

      <Section id="shapes" title="Формы">
        <div className="grid gap-grid md:grid-cols-2">
          <Sheet className="grid content-start gap-5">
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
          </Sheet>
          <Sheet className="grid content-start gap-5">
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
          </Sheet>
        </div>
      </Section>

      <Section id="urgency" title="Срочность">
        <Sheet className="grid gap-4">
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
            Цвет срочность не передаёт: только плашка, рамка или пунктир, иконка
            и&nbsp;слово.
          </p>
        </Sheet>
      </Section>

      <Section id="surfaces" title="Поверхности">
        <div className="grid gap-grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-3 rounded-sheet surface-notice p-sheet shadow-sheet">
            <h3 className="text-title">Сегодня помогли</h3>
            <ul className="grid gap-2">
              {[
                ["Анна", "1 000", "12 минут назад"],
                ["Аноним", "500", "40 минут назад"],
                ["Сергей", "3 000", "2 часа назад"],
              ].map(([name, sum, when]) => (
                <li
                  key={name}
                  className="flex justify-between gap-3 border-b border-dotted pb-1.5"
                >
                  <b className="tabular-nums">
                    {name}&nbsp;— {sum?.replace(" ", NBSP)}&nbsp;₽
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

      <Section id="controls" title="Кнопки и поля">
        <div className="grid gap-grid md:grid-cols-2">
          <Sheet className="grid content-start gap-5">
            <div className="grid gap-2">
              <SpecLabel>«Помочь»: жёлтая бумага, рамка 2 px</SpecLabel>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="inline-flex min-h-cta items-center justify-center border-2 border-notice-foreground bg-notice px-6 font-display text-button text-notice-foreground uppercase transition-[translate,box-shadow] duration-150 ease-out hover:-translate-y-px hover:shadow-sheet active:translate-y-px active:shadow-none"
                >
                  Помочь Бурану
                </button>
                <button
                  type="button"
                  disabled
                  className="inline-flex min-h-cta cursor-not-allowed items-center justify-center border-2 border-dashed border-perforation px-6 font-display text-button text-toner-muted uppercase"
                >
                  Собрано
                </button>
              </div>
            </div>
            <div className="grid gap-2">
              <SpecLabel>shadcn Button до DS-2: primary = тонер</SpecLabel>
              <div className="flex flex-wrap gap-2">
                <Button>Сохранить</Button>
                <Button variant="outline">Отмена</Button>
                <Button variant="secondary">Черновик</Button>
                <Button variant="ghost">Ещё</Button>
                <Button variant="destructive">Удалить</Button>
                <Button variant="link">Ссылка</Button>
              </div>
            </div>
            <p className="max-w-prose">
              Ссылка в&nbsp;тексте —{" "}
              <a href="#controls" className="text-pen underline">
                отчёт за&nbsp;сентябрь
              </a>
              . Нажмите Tab: кольцо фокуса&nbsp;— ручкой, 3&nbsp;px. Выделите
              текст: заливка ручкой, буквы цветом бумаги.
            </p>
          </Sheet>
          <Sheet className="grid content-start gap-5">
            <div className="grid gap-1.5">
              <label
                htmlFor="tokens-email"
                className="font-display text-label uppercase"
              >
                Почта для чека
              </label>
              <input
                id="tokens-email"
                type="email"
                defaultValue="anna@gmial.com"
                aria-invalid
                aria-describedby="tokens-email-error"
                className="h-11 border border-input bg-paper px-3 text-body aria-invalid:border-danger"
              />
              <p
                id="tokens-email-error"
                className="flex items-start gap-1.5 text-caption text-danger"
              >
                <CircleX aria-hidden className="mt-0.5 size-4 shrink-0" />
                Проверьте адрес: похоже на опечатку в&nbsp;домене.
              </p>
            </div>
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
          </Sheet>
        </div>
      </Section>

      <Section id="spacing" title="Отступы">
        <Sheet>
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
        </Sheet>
      </Section>
    </main>
  );
}
