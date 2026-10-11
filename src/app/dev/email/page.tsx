import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { getEnv } from "@/lib/env";
import { SHELTER_NAME } from "@/lib/shelter";
import { cn } from "@/lib/utils";
import type { EmailContext } from "@/server/email/context";
import { emails, type EmailType } from "@/server/email/registry";
import { renderEmail } from "@/server/email/render";
import { SHEET_WIDTH } from "@/server/email/theme";

import { assertDevelopment } from "../dev-only";
import { Paper, Section } from "../ui/showcase";
import { EmailFrame } from "./email-frame";
import {
  forceTheme,
  parsePreviewQuery,
  previewHref,
  type PreviewQuery,
} from "./preview-query";
import { SendSampleForm } from "./send-sample-form";

// Metadata is resolved alongside the page, so it needs the same guard.
export function generateMetadata(): Metadata {
  assertDevelopment();
  return { title: "Письма" };
}

const THEME_LABELS: Record<PreviewQuery["theme"], string> = {
  light: "Светлая",
  dark: "Тёмная",
};

// The reference phone of the project and a desktop mail client's pane.
const FRAME_WIDTHS: Record<PreviewQuery["width"], number> = {
  phone: 375,
  desktop: SHEET_WIDTH + 120,
};
const WIDTH_LABELS: Record<PreviewQuery["width"], string> = {
  phone: "Телефон, 375 px",
  desktop: "Компьютер",
};

/**
 * Every letter of the registry with its sample data, as the worker would
 * send it: the same renderEmail(), only the shelter's contacts are made up
 * instead of read from the settings.
 */
export default async function EmailPreviewPage({
  searchParams,
}: PageProps<"/dev/email">) {
  assertDevelopment();
  const query = parsePreviewQuery(await searchParams);
  const { examples } = emails[query.template];
  const env = getEnv();
  const context: EmailContext = {
    siteUrl: env.APP_URL,
    timeZone: env.SHELTER_TIMEZONE,
    shelter: { name: SHELTER_NAME, email: "priyut@shelter.localhost" },
  };
  const letter = await renderEmail(
    query.template,
    examples[query.example]!.props,
    context,
  );

  return (
    <main className="mx-auto grid max-w-[80rem] grid-cols-[minmax(0,1fr)] gap-section px-gutter py-section">
      <header className="grid gap-sheet rounded-sheet bg-paper p-sheet shadow-sheet">
        <div className="grid gap-3">
          <h1 className="text-hero">Письма</h1>
          <p className="max-w-prose">
            Шаблоны из <Code>src/server/email</Code> с&nbsp;данными-примерами —
            так их отправит воркер. Только в&nbsp;development. Тема
            и&nbsp;ширина здесь — это почтовая программа читателя,
            а&nbsp;не&nbsp;сайт.
          </p>
        </div>
        <div className="grid gap-4 border-t border-input pt-4 md:grid-cols-2">
          {Object.keys(emails).length > 1 ? (
            <Options label="Письмо" className="md:col-span-2">
              {(Object.keys(emails) as EmailType[]).map((template) => (
                <Option
                  key={template}
                  href={previewHref(query, { template })}
                  current={template === query.template}
                >
                  {template}
                </Option>
              ))}
            </Options>
          ) : null}
          <Options label="Пример" className="md:col-span-2">
            {Object.entries(examples).map(([example, { label }]) => (
              <Option
                key={example}
                href={previewHref(query, { example })}
                current={example === query.example}
              >
                {label}
              </Option>
            ))}
          </Options>
          <Options label="Тема почтовой программы">
            {(["light", "dark"] as const).map((theme) => (
              <Option
                key={theme}
                href={previewHref(query, { theme })}
                current={theme === query.theme}
              >
                {THEME_LABELS[theme]}
              </Option>
            ))}
          </Options>
          <Options label="Ширина окна">
            {(["phone", "desktop"] as const).map((width) => (
              <Option
                key={width}
                href={previewHref(query, { width })}
                current={width === query.width}
              >
                {WIDTH_LABELS[width]}
              </Option>
            ))}
          </Options>
        </div>
      </header>

      <Section
        id="letter"
        title="Письмо"
        description={
          <>
            <Code>{query.template}</Code>, пример «
            {examples[query.example]!.label}».
          </>
        }
      >
        <Paper className="grid gap-4">
          <dl className="grid gap-x-4 gap-y-1 text-caption sm:grid-cols-[auto_minmax(0,1fr)]">
            <dt className="font-mono text-mono text-toner-muted">Тема</dt>
            <dd>{letter.subject}</dd>
            <dt className="font-mono text-mono text-toner-muted">От кого</dt>
            <dd>{SHELTER_NAME}</dd>
          </dl>
          {/* On a phone the frame reaches the screen's edges: a 375 px
              client on a 375 px screen. A narrower screen scrolls it. */}
          <div className="-mx-[calc(var(--spacing-gutter)+var(--spacing-sheet))] overflow-x-auto md:mx-0">
            <div className="w-fit md:border md:border-toner">
              <EmailFrame
                html={forceTheme(letter.html, query.theme)}
                title={`Письмо «${letter.subject}»`}
                width={FRAME_WIDTHS[query.width]}
              />
            </div>
          </div>
        </Paper>
      </Section>

      <Section
        id="text"
        title="Текстом"
        description="Вторая часть того же письма: её читают программы без HTML, часы и экранные дикторы некоторых почтовых клиентов."
      >
        <Paper>
          <pre className="font-mono text-mono break-words whitespace-pre-wrap">
            {letter.text}
          </pre>
        </Paper>
      </Section>

      <Section
        id="send"
        title="В почту"
        description={
          <>
            Образец уходит тем же путём, что и настоящие письма: событие
            в&nbsp;outbox, воркер, SMTP. Нужны <Code>pnpm dev:up</Code>,{" "}
            <Code>pnpm db:seed</Code> и&nbsp;запущенный <Code>pnpm worker</Code>
            ; письмо появится в&nbsp;Mailpit — <Code>localhost:8025</Code>.
          </>
        }
      >
        <Paper>
          <SendSampleForm template={query.template} example={query.example} />
        </Paper>
      </Section>
    </main>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="font-mono text-mono">{children}</code>;
}

function Options({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <nav
      aria-label={label}
      className={cn("grid content-start gap-1.5", className)}
    >
      <p className="font-mono text-mono-sm text-toner-muted">{label}</p>
      <ul className="flex flex-wrap gap-2">{children}</ul>
    </nav>
  );
}

function Option({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        // The choice is the page's state, not a place in it.
        aria-current={current ? "true" : undefined}
        scroll={false}
        className={cn(
          "flex min-h-11 items-center border-line border-toner px-3 font-display text-label text-toner uppercase",
          "hover:bg-board aria-[current]:bg-toner aria-[current]:text-paper",
          "forced-colors:aria-[current]:bg-[color:Highlight] forced-colors:aria-[current]:text-[color:HighlightText] forced-colors:aria-[current]:forced-color-adjust-none",
        )}
      >
        {children}
      </Link>
    </li>
  );
}
