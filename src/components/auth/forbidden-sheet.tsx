import Link from "next/link";
import { cn } from "@/lib/utils";
import { AUTH_LINK_CLASS } from "./field";

const linkClass = cn(AUTH_LINK_CLASS, "text-pen");

/** 403 from forbidden(): signed in, but this role may not open the page. */
export function ForbiddenSheet() {
  return (
    <main className="flex min-h-dvh flex-col items-center px-gutter py-section sm:justify-center">
      <title>Нет доступа · Админка</title>
      <div className="flex w-full max-w-md flex-col gap-4 rounded-sheet bg-paper p-sheet shadow-sheet">
        <h1 className="text-title">Нет доступа</h1>
        <p className="text-toner">
          Этот раздел — для сотрудников приюта. Если вы сотрудник, войдите под
          своей учётной записью; если доступа не хватает — попросите владельца
          приюта выдать нужную роль.
        </p>
        <div className="flex flex-wrap gap-x-6 text-caption">
          <Link href="/admin/login" className={linkClass}>
            Войти как сотрудник
          </Link>
          <Link href="/" className={linkClass}>
            На сайт приюта
          </Link>
        </div>
      </div>
    </main>
  );
}
