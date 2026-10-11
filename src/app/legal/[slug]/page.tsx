import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LEGAL_DOCUMENTS, legalTypeOfSlug } from "@/server/legal/catalog";
import { getLegalPageData } from "../cached";
import { LegalDocumentView } from "../legal-document-view";

// ISR: nothing is rendered at build time (no database there); a page is
// rendered on its first visit and kept until the `legal` tag expires.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: PageProps<"/legal/[slug]">): Promise<Metadata> {
  const type = legalTypeOfSlug((await params).slug);
  if (!type) return {};
  const { document } = await getLegalPageData(type, null);
  return {
    title: LEGAL_DOCUMENTS[type].title,
    // Nothing to find here until the text is published.
    robots: document ? undefined : { index: false },
  };
}

export default async function LegalDocumentPage({
  params,
}: PageProps<"/legal/[slug]">) {
  const type = legalTypeOfSlug((await params).slug);
  if (!type) notFound();

  return (
    <LegalDocumentView type={type} data={await getLegalPageData(type, null)} />
  );
}
