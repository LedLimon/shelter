import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { timeZoneOptions } from "@/lib/time-zones";
import { requireStaff } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { getSettings } from "@/server/settings";
import { settingsFormValues } from "./schema";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Настройки" };

export default async function SettingsPage() {
  await requireStaff("settings.edit");
  const settings = await getSettings(getDb());

  return (
    <>
      <PageHeader
        title="Настройки"
        description="Реквизиты, контакты, готовые суммы и часовой пояс. Менять их может только владелец приюта."
      />
      <SettingsForm
        defaultValues={settingsFormValues(settings)}
        timeZones={timeZoneOptions(settings["shelter.timezone"], new Date())}
      />
    </>
  );
}
