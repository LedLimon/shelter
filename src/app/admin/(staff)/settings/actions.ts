"use server";

import { adminAction } from "@/server/admin/action";
import { saveSettings as save } from "@/server/settings";
import { settingsFormSchema, settingsFormValues } from "./schema";

/** Saves the settings form; returns the values as they are stored now. */
export const saveSettings = adminAction(
  settingsFormSchema,
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
    return settingsFormValues(settings);
  },
);
