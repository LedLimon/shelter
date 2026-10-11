import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";

export default function StaffNotFound() {
  return (
    <>
      <title>Страница не найдена · Админка</title>
      <PageHeader title="Страница не найдена" />
      <Panel className="max-w-3xl">
        <p className="max-w-prose">
          Такой страницы в админке нет: возможно, ссылка устарела или в адресе
          опечатка. Разделы — в меню.
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
