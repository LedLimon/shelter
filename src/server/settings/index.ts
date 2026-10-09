import "server-only";
import type { Db } from "@/server/db";
import { settingSchemas, type SettingKey, type SettingValue } from "./schema";

export type { SettingKey, SettingValue } from "./schema";

/** The stored value, or undefined if the setting was never saved. */
export async function getSetting<K extends SettingKey>(
  db: Db,
  key: K,
): Promise<SettingValue<K> | undefined> {
  const row = await db.setting.findUnique({ where: { key } });
  if (!row) return undefined;
  return settingSchemas[key].parse(row.value) as SettingValue<K>;
}

/** Validates the value against the key's schema and saves it. */
export async function setSetting<K extends SettingKey>(
  db: Db,
  key: K,
  value: SettingValue<K>,
): Promise<void> {
  const parsed = settingSchemas[key].parse(value);
  await db.setting.upsert({
    where: { key },
    create: { key, value: parsed },
    update: { value: parsed },
  });
}
