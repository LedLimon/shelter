import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { requireStaff } from "@/server/auth/session";
import { getDb } from "@/server/db";
import {
  LEGAL_DOCUMENTS,
  legalDraft,
  legalHref,
  legalTypeOfSlug,
  publishedLegalVersions,
} from "@/server/legal";
import { getSettings } from "@/server/settings";
import { DraftForm } from "./draft-form";
import { NewDraft } from "./new-draft";

export async function generateMetadata({
  params,
}: PageProps<"/admin/legal/[slug]">): Promise<Metadata> {
  const type = legalTypeOfSlug((await params).slug);
  return { title: type ? LEGAL_DOCUMENTS[type].title : "Страница не найдена" };
}

export default async function LegalDocumentAdminPage({
  params,
}: PageProps<"/admin/legal/[slug]">) {
  // Access first: which addresses exist is for the owner to know.
  await requireStaff("legal.edit");
  const type = legalTypeOfSlug((await params).slug);
  if (!type) notFound();

  const db = getDb();
  const draft = await legalDraft(db, type);
  const versions = await publishedLegalVersions(db, type);
  const timeZone = (await getSettings(db))["shelter.timezone"];
  const { title, about } = LEGAL_DOCUMENTS[type];
  const current = versions[0];
  const nextVersion = (current?.version ?? 0) + 1;

  return (
    <>
      <div className="grid gap-3">
        <Link
          href="/admin/legal"
          className="inline-flex min-h-9 w-fit items-center gap-1.5 text-caption text-pen underline hover:decoration-[3px]"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Все документы
        </Link>
        <PageHeader
          title={title}
          description={about}
          actions={
            current && (
              <a
                href={legalHref(type)}
                target="_blank"
                rel="noopener"
                // cn() settles the variant's frame against the base's
                // transparent one.
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                )}
              >
                Открыть на сайте
                <ExternalLink aria-hidden />
                <span className="sr-only">(в новой вкладке)</span>
              </a>
            )
          }
        />
      </div>

      {draft ? (
        <DraftForm
          // A draft made after this one was published or dropped is another form.
          key={draft.id}
          draft={{
            id: draft.id,
            version: draft.version,
            body: draft.body,
            sha256: draft.sha256,
          }}
          title={title}
        />
      ) : (
        <NewDraft
          type={type}
          version={nextVersion}
          currentVersion={current?.version ?? null}
        />
      )}

      <Panel
        title="Опубликованные версии"
        description="Их текст закрыт навсегда: к версии привязаны согласия людей и пожертвования."
        className="max-w-3xl"
      >
        {versions.length === 0 ? (
          <p className="max-w-prose text-toner-muted">
            Пока ни&nbsp;одной: на&nbsp;сайте этого документа нет. Он появится,
            когда вы&nbsp;опубликуете черновик.
          </p>
        ) : (
          <div
            role="region"
            aria-label="Опубликованные версии"
            // Scrolls sideways on a phone, like DataTable.
            tabIndex={0}
            className="relative overflow-x-auto scroll-shade-x"
          >
            <table className="w-full min-w-xl border-collapse text-caption">
              <caption className="sr-only">Опубликованные версии</caption>
              <thead>
                <tr>
                  {["Версия", "Действует с", "Согласий", "SHA-256 текста"].map(
                    (heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className={cn(
                          "border-b-line border-toner px-2.5 py-2 text-left align-bottom font-display text-label whitespace-nowrap uppercase",
                          heading === "Согласий" && "text-right",
                        )}
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {versions.map((version) => (
                  <tr
                    key={version.id}
                    className="border-b border-perforation/45 last:border-b-0 hover:bg-board/35"
                  >
                    <td className="px-2.5 py-2 align-top whitespace-nowrap">
                      <a
                        href={legalHref(type, version.version)}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex min-h-9 items-center text-pen underline hover:decoration-[3px]"
                      >
                        Версия {version.version}
                        <span className="sr-only"> (в новой вкладке)</span>
                      </a>
                      {version.version === current?.version && (
                        <span className="text-toner-muted"> — действует</span>
                      )}
                    </td>
                    <td className="px-2.5 py-2 align-top font-mono text-mono whitespace-nowrap">
                      {formatDateTime(version.effectiveAt, {
                        timeZone,
                        year: "always",
                      })}
                    </td>
                    <td className="px-2.5 py-2 text-right align-top tabular-nums">
                      {version.consents}
                    </td>
                    <td className="px-2.5 py-2 align-top font-mono text-mono-sm break-all text-toner-muted">
                      {version.sha256}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
