import "server-only";
import { updateTag } from "next/cache";
import type { z } from "zod";
import { recordAudit, type AuditEntry } from "@/server/audit";
import {
  assertCan,
  ForbiddenError,
  type Permission,
} from "@/server/auth/permissions";
import { getStaffUser, type StaffUser } from "@/server/auth/session";
import { getDb, type Db } from "@/server/db";
import {
  ACTION_MESSAGES,
  ActionError,
  type ActionFailure,
  type ActionResult,
} from "./result";

export type AdminActionContext = {
  /** The staff member, already checked for the action's permission. */
  user: StaffUser;
  /**
   * The action's transaction: everything written through it commits together
   * with the audit records, or not at all.
   */
  db: Db;
  /** Describes a change for the audit log; call it once per changed record. */
  audit: (entry: AuditEntry) => void;
  /**
   * Cache tags of public pages to expire (`need:{id}`, `needs`). They expire
   * after the commit: revalidating inside the transaction could cache the old
   * data again.
   */
  revalidate: (...tags: string[]) => void;
};

/**
 * Wraps the body of an admin server action: staff session → permission → zod
 * → handler in a transaction → audit → cache tags. Returns an ActionResult
 * instead of throwing, because a thrown error reaches the browser without its
 * message.
 *
 * ```ts
 * "use server";
 * export const publishNeed = adminAction(schema, "needs.publish",
 *   async ({ id }, { db, user, audit, revalidate }) => {
 *     await publish(db, id, user);
 *     audit({ action: "need.publish", entity: "Need", entityId: id });
 *     revalidate(`need:${id}`, "needs");
 *   });
 * ```
 *
 * The handler refuses with `throw new ActionError(message, fieldErrors?)` and
 * may check further permissions with assertCan(). Anything else it throws is
 * a bug: it propagates, and the form shows a generic message.
 *
 * Don't call redirect() in the handler: it works by throwing, which would
 * roll the transaction back and then navigate to a record that was never
 * saved. Return what the page needs (an id) and navigate in the form's
 * `onSuccess`; adminAction refuses a redirect loudly.
 */
export function adminAction<Schema extends z.ZodType, Data = void>(
  schema: Schema,
  permission: Permission,
  handler: (
    input: z.output<Schema>,
    context: AdminActionContext,
  ) => Promise<Data>,
): (input: z.input<Schema>) => Promise<ActionResult<Data>> {
  return async function action(input) {
    const user = await getStaffUser();
    if (!user) return failure("unauthorized");

    try {
      assertCan(user, permission);

      // The browser can send anything, whatever the parameter's type says.
      const parsed = schema.safeParse(input);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: "validation",
            message: ACTION_MESSAGES.validation,
            fieldErrors: fieldErrorsOf(parsed.error),
          },
        };
      }

      const tags = new Set<string>();
      const data = await getDb().$transaction(async (tx) => {
        const entries: AuditEntry[] = [];
        let result: Data;
        try {
          result = await handler(parsed.data, {
            user,
            db: tx,
            audit: (entry) => entries.push(entry),
            revalidate: (...names) => names.forEach((name) => tags.add(name)),
          });
        } catch (error) {
          if (isRedirect(error)) {
            throw new Error(
              "redirect() inside an adminAction handler rolls its transaction " +
                "back: return the id and navigate in the form's onSuccess.",
            );
          }
          throw error;
        }
        await recordAudit(tx, user, entries);
        return result;
      });
      for (const tag of tags) updateTag(tag);
      return { ok: true, data };
    } catch (error) {
      if (error instanceof ForbiddenError) return failure("forbidden");
      if (error instanceof ActionError) {
        return {
          ok: false,
          error: {
            code: error.fieldErrors ? "validation" : "failed",
            message: error.message,
            fieldErrors: error.fieldErrors,
          },
        };
      }
      throw error;
    }
  };
}

function failure(code: "unauthorized" | "forbidden"): {
  ok: false;
  error: ActionFailure;
} {
  return { ok: false, error: { code, message: ACTION_MESSAGES[code] } };
}

/** What redirect() of next/navigation throws: an error with this digest. */
function isRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}

/** The first message of every field, keyed by its path: `contacts.email`. */
function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    errors[issue.path.join(".")] ??= issue.message;
  }
  return errors;
}
