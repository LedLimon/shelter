"use server";

import { adminAction } from "@/server/admin/action";
import { getSettings, saveSettings as save } from "@/server/settings";
import { settingsChangesSchema, settingsFormValues } from "./schema";

/**
 * Saves the groups of the settings form that the owner changed; returns the
 * whole form as it is stored now, changes made elsewhere included.
 */
export const saveSettings = adminAction(
  settingsChangesSchema,
  "settings.edit",
  async (settings, { db, audit, revalidate }) => {
    const changes = await save(db, settings);
    // Organisation details and public contacts: nothing personal in the diff.
    for (const { key, before, after } of changes) {
      audit({
        action: "settings.update",
        entity: "Setting",
        entityId: key,
        diff: { before, after },
      });
    }
    if (changes.length > 0) revalidate("settings");
    return settingsFormValues(await getSettings(db));
  },
);
