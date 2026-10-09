import Link from "next/link";

/** 403 from forbidden(): signed in, but this role may not open the page. */
export default function Forbidden() {
  return (
    <main className="flex min-h-dvh flex-col items-center px-gutter py-section sm:justify-center">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-sheet bg-paper p-sheet shadow-sheet">
        <h1 className="text-title">Нет доступа</h1>
        <p className="text-caption text-toner-muted">
          Этот раздел — для сотрудников приюта. Если вы сотрудник, войдите под
          своей учётной записью; если доступа не хватает — попросите владельца
          приюта выдать нужную роль.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-caption">
          <Link href="/admin/login" className="text-pen underline">
            Войти как сотрудник
          </Link>
          <Link href="/" className="text-pen underline">
            На сайт приюта
          </Link>
        </div>
      </div>
    </main>
  );
}
