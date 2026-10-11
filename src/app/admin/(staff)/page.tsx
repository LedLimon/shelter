import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { requireStaff } from "@/server/auth/session";

export default async function AdminDashboardPage() {
  const user = await requireStaff();

  return (
    <>
      <PageHeader title={`Здравствуйте, ${user.name}`} />
      <Panel title="Сводка дня" className="max-w-3xl">
        <p className="max-w-prose">
          Здесь появится то, что требует внимания сегодня: поступления за день,
          нужды, которым немного не хватает до цели, неудачные автоплатежи,
          вещи, которые ждут приёмки, и ошибки платёжных уведомлений.
        </p>
        <p className="max-w-prose text-toner-muted">
          Пока сводки нет — откройте нужный раздел в меню.
        </p>
      </Panel>
    </>
  );
}
