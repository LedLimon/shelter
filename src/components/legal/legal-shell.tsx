import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import type { LegalDocumentType } from "@/generated/prisma/enums";
import {
  LEGAL_DOCUMENT_TYPES,
  LEGAL_DOCUMENTS,
  legalHref,
} from "@/server/legal/catalog";
import { cn } from "@/lib/utils";

/**
 * The frame of the legal pages until the public layout exists (DS-5, which
 * replaces this file): the way back to the site, the page's sheets, and the
 * list of the other documents.
 */
export function LegalShell({
  current,
  children,
}: {
  /** The document on the page, marked in the list below. */
  current?: LegalDocumentType;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-grid px-gutter py-6 md:py-10">
      <header>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 font-display text-label uppercase hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" />
          На сайт приюта
        </Link>
      </header>

      <main className="grid gap-grid">{children}</main>

      <footer className="mt-auto grid gap-6 pt-section md:grid-cols-[1fr_auto] md:items-end">
        <nav aria-label="Документы приюта">
          <h2 className="mb-2 font-mono text-mono-sm font-normal text-toner-muted">
            Документы приюта
          </h2>
          <ul>
            {LEGAL_DOCUMENT_TYPES.map((type) => (
              <li key={type}>
                <Link
                  href={legalHref(type)}
                  aria-current={type === current ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center text-caption text-pen underline hover:decoration-[3px]",
                    "aria-[current=page]:font-bold aria-[current=page]:text-toner aria-[current=page]:no-underline",
                  )}
                >
                  {LEGAL_DOCUMENTS[type].title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <ThemeSwitcher className="w-full md:w-72" />
      </footer>
    </div>
  );
}

/** A sheet of paper on the board: the unit every legal page is made of. */
export function LegalSheet({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-sheet bg-paper p-sheet shadow-sheet md:p-10",
        className,
      )}
    >
      {children}
    </section>
  );
}
