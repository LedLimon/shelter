// Shared by the legal tests. A file's tests share one database and published
// versions stay for good, so tests count versions from what is already there.
import type { LegalDocumentType } from "@/generated/prisma/enums";
import { getDb } from "@/server/db";
import {
  createLegalDraft,
  legalDraft,
  publishLegalDraft,
  saveLegalDraft,
  type PublishedLegalDocument,
} from "@/server/legal";

let counter = 0;

/** A text no other version has: publishing a repeat is refused. */
export function uniqueBody(label = "Текст"): string {
  counter += 1;
  return `${label} №${counter}`;
}

/** Publishes the next version of the type with this text and returns it. */
export async function publishVersion(
  type: LegalDocumentType,
  body = uniqueBody(type),
): Promise<PublishedLegalDocument> {
  const db = getDb();
  const draft =
    (await legalDraft(db, type)) ?? (await createLegalDraft(db, type));
  const { draft: saved } = await saveLegalDraft(
    db,
    draft.id,
    body,
    draft.sha256,
  );
  return publishLegalDraft(db, saved.id, saved.sha256);
}
