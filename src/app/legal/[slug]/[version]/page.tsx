import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  LEGAL_DOCUMENTS,
  legalTypeOfSlug,
  parseLegalVersion,
} from "@/server/legal/catalog";
import { getLegalPageData } from "../../cached";
import { LegalDocumentView } from "../../legal-document-view";

// The permanent address of one version: consents and donations refer to a
// version, and its text has to stay readable after the next one comes out.

// ISR, as on the document's own page.
export function generateStaticParams() {
  return [];
}

async function load({ params }: PageProps<"/legal/[slug]/[version]">) {
  const { slug, version: segment } = await params;
  const type = legalTypeOfSlug(slug);
  const version = parseLegalVersion(segment);
  if (!type || version === undefined) return null;
  // The list of versions is cached once per document: a number that is not
  // on it reaches neither the database nor a cache entry of its own.
  const { versions } = await getLegalPageData(type, null);
  if (!versions.some((published) => published.version === version)) {
    return null;
  }
  const data = await getLegalPageData(type, version);
  return data.document ? { type, version, data } : null;
}

export async function generateMetadata(
  props: PageProps<"/legal/[slug]/[version]">,
): Promise<Metadata> {
  const page = await load(props);
  if (!page) return {};
  return {
    title: `${LEGAL_DOCUMENTS[page.type].title}, версия ${page.version}`,
    // Search engines get the document's own page, always the version in force.
    robots: { index: false },
  };
}

export default async function LegalVersionPage(
  props: PageProps<"/legal/[slug]/[version]">,
) {
  const page = await load(props);
  if (!page) notFound();

  return <LegalDocumentView type={page.type} data={page.data} pinned />;
}
