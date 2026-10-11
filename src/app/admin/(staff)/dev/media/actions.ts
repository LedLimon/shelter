"use server";

import { adminAction } from "@/server/admin/action";
import { ActionError } from "@/server/admin/result";
import { MediaError, setMediaRedacted } from "@/server/media";
import { mediaDemoSchema } from "./schema";

/**
 * Saves what the demo form can save without a dog or an expense to attach
 * files to: the «Личные данные закрашены» marks of the receipts. This is how
 * a real form publishes a document — setMediaRedacted() in its own action,
 * with an audit record.
 */
export const saveMediaDemo = adminAction(
  mediaDemoSchema,
  "media.upload",
  async ({ photos, receipts }, { db, audit }) => {
    // The page is 404 outside `next dev`; its action must be too.
    if (process.env.NODE_ENV !== "development") {
      throw new ActionError("Эта страница работает только в разработке.");
    }
    for (const { id, redacted } of receipts) {
      const change = await setMediaRedacted(db, id, redacted).catch(
        (error: unknown) => {
          if (error instanceof MediaError) throw new ActionError(error.message);
          throw error;
        },
      );
      if (change) {
        audit({
          action: redacted ? "media.redact" : "media.unredact",
          entity: "Media",
          entityId: id,
          diff: { before: change.before, after: redacted },
        });
      }
    }
    return { photos, receipts };
  },
);
