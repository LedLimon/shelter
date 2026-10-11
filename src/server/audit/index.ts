import "server-only";
import type { StaffUser } from "@/server/auth/access";
import type { Db } from "@/server/db";

/**
 * One change made by a staff member (docs/architecture.md#комплаенс-и-контент).
 * `diff` must hold no personal data and no secrets.
 */
export type AuditEntry = {
  /** What was done: `settings.update`, `need.publish`. */
  action: string;
  /** The model that changed and the id of its record. */
  entity: string;
  entityId: string;
  diff?: unknown;
};

/**
 * Extension point for the audit log (FND-9, #33): adminAction() calls it with
 * the action's transaction, so the records commit together with the change.
 * Stores nothing until the AuditLog model exists.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- FND-9 writes to the database here
export async function recordAudit(
  db: Db,
  actor: StaffUser,
  entries: readonly AuditEntry[],
): Promise<void> {
  void db;
  void actor;
  void entries;
}
