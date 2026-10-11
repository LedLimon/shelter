import "server-only";
import { isDeepStrictEqual } from "node:util";
import { getEnv } from "@/lib/env";
import type { Db } from "@/server/db";
import {
  defaultSettings,
  settingSchemas,
  type SettingKey,
  type Settings,
  type SettingValue,
} from "./schema";

export type { SettingKey, Settings, SettingValue } from "./schema";

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

/** Every setting; one that was never saved has its default value. */
export async function getSettings(db: Db): Promise<Settings> {
  const settings: Record<string, unknown> = defaultSettings(
    getEnv().SHELTER_TIMEZONE,
  );
  for (const { key, value } of await db.setting.findMany()) {
    // Rows of keys the code no longer knows are left alone.
    if (isSettingKey(key)) settings[key] = settingSchemas[key].parse(value);
  }
  return settings as Settings;
}

export type SettingChange = {
  [K in SettingKey]: {
    key: K;
    before: SettingValue<K>;
    after: SettingValue<K>;
  };
}[SettingKey];

/**
 * Saves the settings that differ from the stored ones and returns what
 * changed, for the audit log. Run it in a transaction to save all or none.
 */
export async function saveSettings(
  db: Db,
  next: Partial<Settings>,
): Promise<SettingChange[]> {
  const current = await getSettings(db);
  const changes: SettingChange[] = [];
  for (const key of Object.keys(settingSchemas) as SettingKey[]) {
    const after = next[key];
    if (after === undefined || isDeepStrictEqual(current[key], after)) continue;
    await setSetting(db, key, after);
    changes.push({ key, before: current[key], after } as SettingChange);
  }
  return changes;
}

function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(settingSchemas, key);
}
