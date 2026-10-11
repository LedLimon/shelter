// The log of consents (docs/legal.md#персональные-данные-152-фз): which
// version of which document a person agreed to, where and when.
import type { LegalDocumentType } from "@/generated/prisma/enums";
import type { Db } from "@/server/db/client";
import {
  NOT_GIVEN,
  type ConsentDocument,
  type ConsentValue,
} from "./consent-input";
import { ConsentError } from "./errors";
import type { ConsentEvidence } from "./evidence";

/**
 * The versions in force that a form's consent boxes link to, in the order of
 * `types`. A document that was never published is missing from the result:
 * a form that can't go without it must not be shown.
 */
export async function consentDocuments(
  db: Db,
  types: readonly LegalDocumentType[],
): Promise<ConsentDocument[]> {
  const rows = await db.legalDocument.findMany({
    where: { type: { in: [...types] }, effectiveAt: { not: null } },
    orderBy: { version: "asc" },
    select: { id: true, type: true, version: true },
  });
  // In the order of versions: the last one of a type is in force.
  const current = new Map(rows.map((row) => [row.type, row]));
  return types.flatMap((type) => current.get(type) ?? []);
}

export type ConsentSubject = {
  /** The address typed into the form; stored lowercased. */
  email?: string | null;
  /** The signed-in user, if there is one. */
  userId?: string | null;
};

export type RecordConsentsInput = {
  /**
   * The form's boxes: document type → the id of the version the box was
   * ticked next to, "" for a box left unticked.
   */
  consents: Partial<Record<LegalDocumentType, ConsentValue>>;
  /** Consents this form can't go without. */
  required: readonly LegalDocumentType[];
  subject: ConsentSubject;
  /** Where the boxes were: "donation:{id}", "account". No personal data. */
  context: string;
  /** consentEvidence() of the request. */
  evidence: ConsentEvidence;
};

export type RecordedConsent = ConsentDocument & {
  /** The id of the consent record. */
  consentId: string;
};

/**
 * Records every consent given in a form — one row per ticked box, each with
 * the version of the document the person saw. Call it in the transaction
 * that writes what the consents are for (the donation, the account), so
 * neither exists without the other.
 *
 * Throws ConsentError: REQUIRED if a box from `required` is not ticked,
 * OUTDATED if a box was ticked next to a version that is not in force (a new
 * one was published while the form was open): the person reads the current
 * text and ticks the box again. Nothing is written then.
 */
export async function recordConsents(
  db: Db,
  { consents, required, subject, context, evidence }: RecordConsentsInput,
): Promise<RecordedConsent[]> {
  const email = subject.email?.trim().toLowerCase() || null;
  const userId = subject.userId ?? null;
  if (!email && !userId) throw new ConsentError("NO_SUBJECT");

  const given = (Object.keys(consents) as LegalDocumentType[]).filter(
    (type) => (consents[type] ?? NOT_GIVEN) !== NOT_GIVEN,
  );
  for (const type of required) {
    if (!given.includes(type)) throw new ConsentError("REQUIRED", type);
  }
  if (given.length === 0) return [];

  const inForce = await consentDocuments(db, given);
  const documents = given.map((type) => {
    const document = inForce.find((candidate) => candidate.type === type);
    if (!document || document.id !== consents[type]) {
      throw new ConsentError("OUTDATED", type);
    }
    return document;
  });

  const records = await db.consentRecord.createManyAndReturn({
    data: documents.map((document) => ({
      documentId: document.id,
      email,
      userId,
      context,
      ip: evidence.ip,
      userAgent: evidence.userAgent,
    })),
    select: { id: true, documentId: true },
  });
  return records.flatMap((record) => {
    const document = documents.find(({ id }) => id === record.documentId);
    return document ? [{ ...document, consentId: record.id }] : [];
  });
}

/**
 * The newsletter consent of an address that is still in force, or null: no
 * newsletter goes to an address without one. Its id is the token of the
 * unsubscribe link (unsubscribeUrl()).
 */
export async function marketingConsentOf(
  db: Db,
  email: string,
): Promise<{ id: string } | null> {
  return db.consentRecord.findFirst({
    where: {
      email: email.trim().toLowerCase(),
      withdrawnAt: null,
      document: { type: "MARKETING" },
    },
    orderBy: { givenAt: "desc" },
    select: { id: true },
  });
}

export type MarketingConsentState =
  /** No newsletter consent with this id. */
  | { status: "unknown" }
  /** `email` is the address the newsletter goes to; personal data. */
  | { status: "given" | "withdrawn"; email: string | null };

/** What the unsubscribe page shows for a link's token. */
export async function marketingConsentState(
  db: Db,
  consentId: string,
): Promise<MarketingConsentState> {
  const consent = await db.consentRecord.findFirst({
    where: { id: consentId, document: { type: "MARKETING" } },
    select: { email: true, withdrawnAt: true },
  });
  if (!consent) return { status: "unknown" };
  return {
    status: consent.withdrawnAt ? "withdrawn" : "given",
    email: consent.email,
  };
}

/**
 * Withdraws the newsletter consent behind an unsubscribe link — and every
 * other newsletter consent of the same person still in force: they ticked
 * the box with several donations, and want no more letters. Other consents
 * (personal data, the offer) are not touched.
 *
 * Returns how many consents were withdrawn: 0 if the link is unknown or was
 * used already, so a repeated click changes nothing.
 */
export async function withdrawMarketingConsent(
  db: Db,
  consentId: string,
): Promise<number> {
  const consent = await db.consentRecord.findFirst({
    where: { id: consentId, document: { type: "MARKETING" } },
    select: { email: true, userId: true },
  });
  if (!consent) return 0;

  // The database's clock, like givenAt: the two are compared by a CHECK.
  return db.$executeRaw`
    UPDATE "ConsentRecord" AS consent
       SET "withdrawnAt" = transaction_timestamp()
      FROM "LegalDocument" AS document
     WHERE document."id" = consent."documentId"
       AND document."type" = 'MARKETING'
       AND consent."withdrawnAt" IS NULL
       AND (consent."id" = ${consentId}
            OR consent."email" = ${consent.email}
            OR consent."userId" = ${consent.userId})`;
}
