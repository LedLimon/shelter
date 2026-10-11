import { ChevronRight, CircleAlert, PencilLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dates";
import { requireStaff } from "@/server/auth/session";
import { getDb } from "@/server/db";
import {
  LEGAL_DOCUMENT_TYPES,
  LEGAL_DOCUMENTS,
  legalDocumentStates,
} from "@/server/legal";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Юридические документы" };

export default async function LegalDocumentsPage() {
  await requireStaff("legal.edit");
  const db = getDb();
  const states = await legalDocumentStates(db, LEGAL_DOCUMENT_TYPES);
  const timeZone = (await getSettings(db))["shelter.timezone"];

  return (
    <>
      <PageHeader
        title="Юридические документы"
        description="Оферта, политика и согласия. Опубликованную версию изменить нельзя — можно выпустить следующую: сайт помнит, с какой версией согласился каждый человек."
      />
      <Panel className="max-w-3xl">
        <ul>
          {states.map(({ type, current, draft }) => (
            <li
              key={type}
              className="border-b border-dashed border-perforation last:border-b-0"
            >
              <Link
                href={`/admin/legal/${LEGAL_DOCUMENTS[type].slug}`}
                className="group flex items-center gap-3 py-3 hover:bg-accent"
              >
                <span className="grid min-w-0 flex-1 gap-1.5">
                  <span className="font-bold group-hover:underline">
                    {LEGAL_DOCUMENTS[type].title}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    {current ? (
                      <span className="font-mono text-mono text-toner-muted">
                        Версия {current.version} · действует с&nbsp;
                        {formatDate(current.effectiveAt, {
                          timeZone,
                          year: "always",
                        })}
                      </span>
                    ) : (
                      <Badge variant="outline">
                        <CircleAlert aria-hidden />
                        Не опубликован
                      </Badge>
                    )}
                    {draft && (
                      <Badge variant="secondary">
                        <PencilLine aria-hidden />
                        Черновик версии {draft.version}
                      </Badge>
                    )}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden
                  className="size-5 shrink-0 text-toner-muted"
                />
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
