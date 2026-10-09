import type { Metadata } from "next";

import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { Toaster } from "@/components/ui/sonner";

import { assertDevelopment } from "../dev-only";
import { PseudoStates } from "./pseudo-states";
import { ButtonsSection } from "./sections/buttons";
import { ChoicesSection } from "./sections/choices";
import { CardsSection, MarksSection, TabsSection } from "./sections/display";
import { FeedbackSection } from "./sections/feedback";
import { FieldsSection } from "./sections/fields";
import { FormDemo } from "./sections/form-demo";
import { OverlaysSection } from "./sections/overlays";
import { TokenSections } from "./sections/tokens";
import { Paper, Section } from "./showcase";

// Metadata is resolved alongside the page, so it needs the same guard.
export function generateMetadata(): Metadata {
  assertDevelopment();
  return { title: "Витрина «Объявление»" };
}

const CONTENTS: { title: string; links: [id: string, label: string][] }[] = [
  {
    title: "Компоненты",
    links: [
      ["buttons", "Кнопки"],
      ["fields", "Поля"],
      ["choices", "Выбор"],
      ["form", "Форма"],
      ["overlays", "Слои"],
      ["feedback", "Уведомления"],
      ["cards", "Карточки"],
      ["marks", "Метки"],
      ["tabs", "Вкладки"],
    ],
  },
  {
    title: "Токены",
    links: [
      ["palette", "Палитра"],
      ["contrast", "Контраст"],
      ["type", "Шрифты"],
      ["shapes", "Формы"],
      ["urgency", "Срочность"],
      ["surfaces", "Поверхности"],
      ["spacing", "Отступы"],
    ],
  },
];

export default function ShowcasePage() {
  assertDevelopment();
  return (
    <main className="mx-auto grid max-w-[80rem] grid-cols-[minmax(0,1fr)] gap-section px-gutter py-section">
      <PseudoStates />
      <Toaster />

      <header className="grid gap-sheet rounded-sheet bg-paper p-sheet shadow-sheet md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="grid gap-3">
          <h1 className="text-hero">Витрина «Объявление»</h1>
          <p className="max-w-prose">
            Базовые компоненты shadcn/ui в&nbsp;направлении «Объявление»
            и&nbsp;токены из&nbsp;
            <code className="font-mono text-mono">src/app/globals.css</code>.
            Только в&nbsp;development. Состояния наведения, фокуса
            и&nbsp;нажатия показаны настоящими стилями компонентов; всё
            кликабельно. Переключите тему, чтобы проверить тёмную.
          </p>
        </div>
        <ThemeSwitcher className="md:w-[26rem]" />
        <nav
          aria-label="Разделы витрины"
          className="grid gap-4 border-t border-input pt-4 sm:grid-cols-2 md:col-span-2"
        >
          {CONTENTS.map(({ title, links }) => (
            <div key={title} className="grid content-start gap-2">
              <p className="font-mono text-mono-sm text-toner-muted">{title}</p>
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
                {links.map(([id, label]) => (
                  <li key={id}>
                    <a href={`#${id}`} className="text-pen underline">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </header>

      <ButtonsSection />
      <FieldsSection />
      <ChoicesSection />
      <Section
        id="form"
        title="Форма"
        description="react-hook-form + zod + Field: ошибки у поля, введённое не теряется, кнопка держит фокус во время отправки. Отправьте пустую форму, чтобы увидеть ошибки."
      >
        <Paper>
          <FormDemo />
        </Paper>
      </Section>
      <OverlaysSection />
      <FeedbackSection />
      <CardsSection />
      <MarksSection />
      <TabsSection />
      <TokenSections />
    </main>
  );
}
