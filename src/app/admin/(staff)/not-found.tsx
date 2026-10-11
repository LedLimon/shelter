import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { buttonVariants } from "@/components/ui/button";

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
        <div>
          <Link
            href="/admin"
            className={buttonVariants({ variant: "outline" })}
          >
            На дашборд
          </Link>
        </div>
      </Panel>
    </>
  );
}
