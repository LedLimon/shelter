"use server";

import { adminAction } from "@/server/admin/action";
import { ActionError } from "@/server/admin/result";
import {
  createLegalDraft,
  deleteLegalDraft,
  LEGAL_CACHE_TAG,
  LegalError,
  publishLegalDraft,
  saveLegalDraft,
  type LegalErrorCode,
} from "@/server/legal";
import {
  createDraftSchema,
  deleteDraftSchema,
  draftFormSchema,
  publishDraftSchema,
} from "./schema";

const REFUSALS: Record<LegalErrorCode, string> = {
  NOT_FOUND:
    "Этого черновика уже нет: его удалили или опубликовали в другой вкладке. Обновите страницу.",
  DRAFT_EXISTS:
    "У документа уже есть черновик. Обновите страницу — он откроется.",
  PUBLISHED:
    "Эта версия уже опубликована, и изменить её нельзя. Обновите страницу и создайте следующую версию.",
  INVALID_BODY: "Текст документа пуст или слишком длинный.",
  STALE:
    "Черновик изменился после того, как вы его открыли. Обновите страницу, перечитайте текст и опубликуйте ещё раз.",
  UNCHANGED:
    "Текст не отличается от действующей версии — публиковать нечего. Измените текст или удалите черновик.",
};

/**
 * Turns a refusal of src/server/legal into a message for the owner;
 * `messages` replaces the texts that depend on what was being done.
 */
async function refusing<Result>(
  work: () => Promise<Result>,
  messages: Partial<typeof REFUSALS> = {},
): Promise<Result> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof LegalError) {
      throw new ActionError(messages[error.code] ?? REFUSALS[error.code]);
    }
    throw error;
  }
}

/** Starts the next version of a document as a draft. */
export const createDraft = adminAction(
  createDraftSchema,
  "legal.edit",
  async ({ type }, { db, audit }) => {
    const draft = await refusing(() => createLegalDraft(db, type));
    audit({
      action: "legal.draft.create",
      entity: "LegalDocument",
      entityId: draft.id,
      diff: { type, version: draft.version },
    });
    return { id: draft.id, version: draft.version };
  },
);

/**
 * Saves the draft's text over the one the editor was opened with (`sha256`);
 * returns it as stored, with its new hash.
 */
export const saveDraft = adminAction(
  draftFormSchema,
  "legal.edit",
  async ({ id, sha256, body }, { db, audit }) => {
    const { draft, previousSha256 } = await refusing(
      () => saveLegalDraft(db, id, body, sha256),
      {
        // Reloading drops what was typed: say how to keep it.
        STALE:
          "Этот черновик уже сохранили заново — в другой вкладке или до того, как вы вернулись на страницу. Чтобы не потерять правки, скопируйте свой текст, обновите страницу и внесите их в свежий черновик.",
      },
    );
    if (draft.sha256 !== previousSha256) {
      // The texts are public, but long: the hashes tell what changed.
      audit({
        action: "legal.draft.update",
        entity: "LegalDocument",
        entityId: draft.id,
        diff: {
          type: draft.type,
          version: draft.version,
          sha256: { before: previousSha256, after: draft.sha256 },
        },
      });
    }
    return { body: draft.body, sha256: draft.sha256 };
  },
);

/**
 * Publishes the draft whose saved text has this hash: the version comes into
 * force at once, and its text is final.
 */
export const publishDraft = adminAction(
  publishDraftSchema,
  "legal.edit",
  async ({ id, sha256 }, { db, audit, revalidate }) => {
    const published = await refusing(() => publishLegalDraft(db, id, sha256));
    audit({
      action: "legal.publish",
      entity: "LegalDocument",
      entityId: published.id,
      diff: {
        type: published.type,
        version: published.version,
        sha256: published.sha256,
      },
    });
    revalidate(LEGAL_CACHE_TAG);
    return { version: published.version };
  },
);

/** Drops the draft; published versions stay. */
export const deleteDraft = adminAction(
  deleteDraftSchema,
  "legal.edit",
  async ({ id }, { db, audit }) => {
    const draft = await refusing(() => deleteLegalDraft(db, id));
    audit({
      action: "legal.draft.delete",
      entity: "LegalDocument",
      entityId: draft.id,
      diff: { type: draft.type, version: draft.version },
    });
  },
);
