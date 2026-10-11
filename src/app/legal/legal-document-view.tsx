import { FileClock, History } from "lucide-react";
import Link from "next/link";
import { LegalSheet, LegalShell } from "@/components/legal/legal-shell";
import { LegalText } from "@/components/legal/legal-text";
import type { LegalDocumentType } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/dates";
import { LEGAL_DOCUMENTS, legalHref } from "@/server/legal/catalog";
import type { LegalPageData } from "./cached";

/**
 * A legal document's page: the text of one version on a sheet, then the
 * sheet of the other versions. `pinned` is the page of a particular version
 * (/legal/offer/2), which says whether that version is still in force.
 */
export function LegalDocumentView({
  type,
  data: { document, versions, timeZone },
  pinned = false,
}: {
  type: LegalDocumentType;
  data: LegalPageData;
  pinned?: boolean;
}) {
  const { title } = LEGAL_DOCUMENTS[type];
  // Legal dates always carry the year.
  const date = (iso: string) =>
    formatDate(new Date(iso), { timeZone, year: "always" });

  if (!document) {
    return (
      <LegalShell current={type}>
        <LegalSheet className="grid gap-4">
          <h1 className="text-section">{title}</h1>
          <p className="flex max-w-prose items-start gap-2">
            <FileClock aria-hidden className="mt-1 size-5 shrink-0" />
            <span>
              Документ ещё не&nbsp;опубликован: текст готовится. Как только
              он&nbsp;появится, эта страница покажет действующую версию
              и&nbsp;все прежние.
            </span>
          </p>
        </LegalSheet>
      </LegalShell>
    );
  }

  const current = versions[0];
  const inForce = current?.version === document.version;
  // The version that replaced this one, if any: versions go newest first.
  const replacedBy = versions.findLast(
    ({ version }) => version > document.version,
  );
  const others = versions.filter(({ version }) => version !== document.version);

  return (
    <LegalShell current={type}>
      <LegalSheet>
        <article>
          <header className="mb-8 grid gap-3 border-b-line border-foreground pb-5">
            <h1 className="text-section">{title}</h1>
            <p className="font-mono text-mono text-toner-muted">
              Версия {document.version}
              {" · "}
              {inForce || !replacedBy ? (
                <>действует с&nbsp;{date(document.effectiveAt)}</>
              ) : (
                <>
                  действовала с&nbsp;{date(document.effectiveAt)} по&nbsp;
                  {date(replacedBy.effectiveAt)}
                </>
              )}
            </p>
            {!inForce && current && (
              <p className="flex items-start gap-2 border-2 border-foreground p-3 text-caption">
                <History aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  Эта версия больше не&nbsp;действует: её заменила версия{" "}
                  {current.version}.{" "}
                  <Link href={legalHref(type)} className="text-pen underline">
                    Открыть действующую
                  </Link>
                </span>
              </p>
            )}
          </header>

          <LegalText body={document.body} />

          <footer className="mt-10 grid gap-1 border-t-line border-dashed border-perforation pt-4">
            <p className="font-mono text-mono-sm break-all text-toner-muted">
              SHA-256: {document.sha256}
            </p>
            <p className="max-w-prose text-caption text-toner-muted">
              Это контрольная сумма текста. Если в&nbsp;версии изменить хотя бы
              один знак, сумма станет другой: так можно проверить, что текст
              остался тем, с&nbsp;которым вы&nbsp;согласились.
            </p>
          </footer>
        </article>
      </LegalSheet>

      {(others.length > 0 || pinned) && (
        <LegalSheet className="grid gap-3">
          <h2 className="text-title">
            {pinned ? "Все версии" : "Прежние версии"}
          </h2>
          <ul className="grid">
            {(pinned ? versions : others).map((item, index, list) => {
              const next = versions.findLast(
                ({ version }) => version > item.version,
              );
              const shown = item.version === document.version;
              return (
                <li
                  key={item.version}
                  className={
                    index < list.length - 1
                      ? "border-b border-dashed border-perforation"
                      : undefined
                  }
                >
                  <Link
                    href={legalHref(type, item.version)}
                    aria-current={shown ? "page" : undefined}
                    className="group flex min-h-11 flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2"
                  >
                    <span className="text-pen underline group-hover:decoration-[3px] group-aria-[current=page]:font-bold group-aria-[current=page]:text-toner group-aria-[current=page]:no-underline">
                      Версия {item.version}
                    </span>
                    <span className="font-mono text-mono text-toner-muted">
                      {next ? (
                        <>
                          с&nbsp;{date(item.effectiveAt)} по&nbsp;
                          {date(next.effectiveAt)}
                        </>
                      ) : (
                        <>действует с&nbsp;{date(item.effectiveAt)}</>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </LegalSheet>
      )}
    </LegalShell>
  );
}
