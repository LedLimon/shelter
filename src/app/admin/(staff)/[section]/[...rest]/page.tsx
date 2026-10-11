import { notFound } from "next/navigation";
import { findAdminSection } from "@/components/admin/nav-config";
import { requireStaff } from "@/server/auth/session";

// Any address below a section that no page claims (/admin/needs/42 before
// the needs pages exist, a mistyped /admin/settings/x). Without this file
// such an address skips the staff layout: no access check, a bare 404.
// A section's own nested routes are more specific and take over.
export default async function NestedPlaceholderPage({
  params,
}: PageProps<"/admin/[section]/[...rest]">) {
  const section = findAdminSection((await params).section);
  // Access first, as on the section itself: 403 without its permission.
  await requireStaff(section?.permission);
  notFound();
}
