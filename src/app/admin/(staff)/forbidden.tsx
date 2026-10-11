import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";

/**
 * 403 for a staff member whose role may not open a section: the menu stays,
 * unlike on the app-wide page for people who are not staff at all.
 */
export default function StaffForbidden() {
  return (
    <>
      <title>Нет доступа · Админка</title>
      <PageHeader title="Нет доступа" />
      <Panel className="max-w-3xl">
        <p className="max-w-prose">
          Этот раздел закрыт для вашей роли. Если он нужен для работы, попросите
          владельца приюта выдать доступ.
        </p>
        <p>
          <Link href="/admin" className="text-pen underline">
            На дашборд
          </Link>
        </p>
      </Panel>
    </>
  );
}
