import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findAdminSection } from "@/components/admin/nav-config";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { requireStaff } from "@/server/auth/session";

// Stands in for every section of the menu that has no pages yet, so its link
// works and its permission is already enforced. A section's own
// `admin/(staff)/<slug>/page.tsx` takes over the URL; when the last section
// is built, this file goes.

export async function generateMetadata({
  params,
}: PageProps<"/admin/[section]">): Promise<Metadata> {
  const section = findAdminSection((await params).section);
  return { title: section?.label ?? "Страница не найдена" };
}

export default async function SectionPlaceholderPage({
  params,
}: PageProps<"/admin/[section]">) {
  const section = findAdminSection((await params).section);
  // Access first: which addresses exist is for staff to know.
  await requireStaff(section?.permission);
  if (!section) notFound();

  return (
    <>
      <PageHeader title={section.label} />
      <Panel title="Раздел ещё не готов" className="max-w-3xl">
        <p className="max-w-prose">
          Он появится в одном из следующих обновлений админки. Доступ к нему у
          вашей роли уже есть — ничего настраивать не придётся.
        </p>
      </Panel>
    </>
  );
}
