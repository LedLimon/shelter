// Versions of the legal documents (docs/legal.md). No `server-only` here: the
// seed runs these functions outside Next.js; the app imports @/server/legal.
import { createHash } from "node:crypto";
import type { LegalDocument } from "@/generated/prisma/client";
import type { LegalDocumentType } from "@/generated/prisma/enums";
import type { Db } from "@/server/db/client";
import { MAX_LEGAL_BODY_LENGTH } from "./catalog";
import { LegalError } from "./errors";
import { LEGAL_STUBS } from "./stubs";

/** A version in force now or earlier: its text never changes. */
export type PublishedLegalDocument = LegalDocument & { effectiveAt: Date };

/**
 * The text as it is stored and hashed: Unix line ends, composed characters
 * (a pasted «й» may come as two code points), no trailing spaces, no blank
 * lines around. Two texts that look the same get the same hash.
 */
export function normalizeLegalBody(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replaceAll("\u0000", "")
    .replace(/[^\S\n]+$/gm, "")
    .replace(/^\n+|\n+$/g, "");
}

/** Hex SHA-256 of the text in UTF-8: what the database's CHECK computes. */
export function sha256Of(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

/** The version in force: the last one published. */
export async function currentLegalDocument(
  db: Db,
  type: LegalDocumentType,
): Promise<PublishedLegalDocument | null> {
  const document = await db.legalDocument.findFirst({
    where: { type, effectiveAt: { not: null } },
    orderBy: { version: "desc" },
  });
  return document as PublishedLegalDocument | null;
}

/** A published version by its number; a draft's number finds nothing. */
export async function publishedLegalDocument(
  db: Db,
  type: LegalDocumentType,
  version: number,
): Promise<PublishedLegalDocument | null> {
  const document = await db.legalDocument.findFirst({
    where: { type, version, effectiveAt: { not: null } },
  });
  return document as PublishedLegalDocument | null;
}

export type LegalVersionSummary = {
  id: string;
  version: number;
  sha256: string;
  effectiveAt: Date;
  /** Consents given to this version, withdrawn ones included. */
  consents: number;
};

/** Every published version of the type, the newest first, without the texts. */
export async function publishedLegalVersions(
  db: Db,
  type: LegalDocumentType,
): Promise<LegalVersionSummary[]> {
  const rows = await db.legalDocument.findMany({
    where: { type, effectiveAt: { not: null } },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      sha256: true,
      effectiveAt: true,
      _count: { select: { consentRecords: true } },
    },
  });
  return rows.map(({ _count, effectiveAt, ...row }) => ({
    ...row,
    effectiveAt: effectiveAt as Date,
    consents: _count.consentRecords,
  }));
}

/** The version being prepared, if there is one. */
export async function legalDraft(
  db: Db,
  type: LegalDocumentType,
): Promise<LegalDocument | null> {
  return db.legalDocument.findFirst({ where: { type, effectiveAt: null } });
}

export type LegalDocumentState = {
  type: LegalDocumentType;
  current: { version: number; effectiveAt: Date } | null;
  draft: { version: number; updatedAt: Date } | null;
};

/** Where every listed document stands: what is in force, what is drafted. */
export async function legalDocumentStates(
  db: Db,
  types: readonly LegalDocumentType[],
): Promise<LegalDocumentState[]> {
  const rows = await db.legalDocument.findMany({
    where: { type: { in: [...types] } },
    orderBy: { version: "asc" },
    select: { type: true, version: true, effectiveAt: true, updatedAt: true },
  });
  return types.map((type) => {
    const state: LegalDocumentState = { type, current: null, draft: null };
    // In the order of versions: the last published one is in force.
    for (const row of rows) {
      if (row.type !== type) continue;
      if (row.effectiveAt) {
        state.current = { version: row.version, effectiveAt: row.effectiveAt };
      } else {
        state.draft = { version: row.version, updatedAt: row.updatedAt };
      }
    }
    return state;
  });
}

/**
 * Starts the next version as a draft. Without `body` it is a copy of the
 * version in force, or the placeholder if nothing was ever published.
 */
export async function createLegalDraft(
  db: Db,
  type: LegalDocumentType,
  body?: string,
): Promise<LegalDocument> {
  const current = await currentLegalDocument(db, type);
  const last = await db.legalDocument.aggregate({
    where: { type },
    _max: { version: true },
  });
  const text = checkedBody(body ?? current?.body ?? LEGAL_STUBS[type]);

  // ON CONFLICT DO NOTHING instead of create() + catching P2002: a failed
  // statement would abort the caller's transaction. A draft made meanwhile
  // holds the type's draft slot (a partial unique index) or the number.
  const [draft] = await db.legalDocument.createManyAndReturn({
    data: [
      {
        type,
        version: (last._max.version ?? 0) + 1,
        body: text,
        sha256: sha256Of(text),
      },
    ],
    skipDuplicates: true,
  });
  if (!draft) {
    throw new LegalError("DRAFT_EXISTS", `${type} already has a draft`);
  }
  return draft;
}

export type SavedLegalDraft = {
  draft: LegalDocument;
  /** The hash before the save, to tell whether the text changed. */
  previousSha256: string;
};

/**
 * Replaces the text of a draft. A published version is never touched.
 * `baseSha256` is the hash of the text the caller started editing from: if
 * the draft was saved again since (another tab, an editor restored from the
 * browser's history), this save would silently undo that one — it is refused.
 */
export async function saveLegalDraft(
  db: Db,
  id: string,
  body: string,
  baseSha256: string,
): Promise<SavedLegalDraft> {
  const text = checkedBody(body);
  const before = await draftOrThrow(db, id);
  if (before.sha256 !== baseSha256) throw staleError(before);
  const sha256 = sha256Of(text);
  if (sha256 === before.sha256) {
    return { draft: before, previousSha256: before.sha256 };
  }

  // The condition repeats the checks for what happened in between.
  const [draft] = await db.legalDocument.updateManyAndReturn({
    where: { id, effectiveAt: null, sha256: baseSha256 },
    data: { body: text, sha256 },
  });
  if (!draft) {
    const now = await db.legalDocument.findUnique({ where: { id } });
    throw now?.effectiveAt ? publishedError(before) : staleError(before);
  }
  return { draft, previousSha256: before.sha256 };
}

/**
 * Publishes a draft: from this moment it is the version in force, and its
 * text is final. `sha256` is the hash of the text the caller read (and
 * showed for confirmation): a draft saved again since is not published
 * blindly.
 */
export async function publishLegalDraft(
  db: Db,
  id: string,
  sha256: string,
): Promise<PublishedLegalDocument> {
  const draft = await draftOrThrow(db, id);
  if (draft.sha256 !== sha256) throw staleError(draft);

  const current = await currentLegalDocument(db, draft.type);
  if (current?.sha256 === draft.sha256) {
    throw new LegalError(
      "UNCHANGED",
      `the draft of ${draft.type} repeats version ${current.version}`,
    );
  }

  // The database's clock, which the trigger insists on. The condition repeats
  // the checks above for a save or a publication that happened in between.
  const published = await db.$executeRaw`
    UPDATE "LegalDocument"
       SET "effectiveAt" = transaction_timestamp(),
           "updatedAt" = transaction_timestamp()
     WHERE "id" = ${id} AND "effectiveAt" IS NULL AND "sha256" = ${sha256}`;
  if (published === 0) throw staleError(draft);

  return (await db.legalDocument.findUniqueOrThrow({
    where: { id },
  })) as PublishedLegalDocument;
}

/** Drops a draft; the version in force and the archive stay. */
export async function deleteLegalDraft(
  db: Db,
  id: string,
): Promise<LegalDocument> {
  const draft = await draftOrThrow(db, id);
  const { count } = await db.legalDocument.deleteMany({
    where: { id, effectiveAt: null },
  });
  if (count === 0) throw publishedError(draft);
  return draft;
}

function checkedBody(body: string): string {
  const text = normalizeLegalBody(body);
  if (text === "") {
    throw new LegalError("INVALID_BODY", "the text is empty");
  }
  if (text.length > MAX_LEGAL_BODY_LENGTH) {
    throw new LegalError(
      "INVALID_BODY",
      `the text is longer than ${MAX_LEGAL_BODY_LENGTH} characters`,
    );
  }
  return text;
}

async function draftOrThrow(db: Db, id: string): Promise<LegalDocument> {
  const document = await db.legalDocument.findUnique({ where: { id } });
  if (!document) throw new LegalError("NOT_FOUND", `no document ${id}`);
  if (document.effectiveAt) throw publishedError(document);
  return document;
}

function publishedError({ type, version }: LegalDocument): LegalError {
  return new LegalError(
    "PUBLISHED",
    `version ${version} of ${type} is published and can't be changed`,
  );
}

function staleError({ type, version }: LegalDocument): LegalError {
  return new LegalError(
    "STALE",
    `the draft of version ${version} of ${type} was changed meanwhile`,
  );
}
