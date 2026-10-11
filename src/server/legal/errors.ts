import type { LegalDocumentType } from "@/generated/prisma/enums";

export type LegalErrorCode =
  /** No document with this id. */
  | "NOT_FOUND"
  /** The type already has a draft: the next version is prepared in one place. */
  | "DRAFT_EXISTS"
  /** The version is published: it can't be changed or deleted. */
  | "PUBLISHED"
  /** The text is empty or longer than MAX_LEGAL_BODY_LENGTH. */
  | "INVALID_BODY"
  /** The draft was saved again after the caller read it. */
  | "STALE"
  /** The draft's text is the same as the version in force. */
  | "UNCHANGED";

/**
 * A refusal of the legal documents API, detected before the write. What only
 * the database catches (the triggers of the migration `legal_documents`)
 * comes as a Prisma error with a message starting with "legal:".
 */
export class LegalError extends Error {
  readonly code: LegalErrorCode;

  constructor(code: LegalErrorCode, message: string) {
    super(`legal: ${message}`);
    this.name = "LegalError";
    this.code = code;
  }
}

export type ConsentErrorCode =
  /** A consent the form can't go without was not given. */
  | "REQUIRED"
  /**
   * The box was ticked next to a version that is no longer in force (or
   * never was): the person has to read the current text and tick it again.
   */
  | "OUTDATED"
  /** Neither an email nor a user: there is no one to record the consent for. */
  | "NO_SUBJECT";

/** A consent that can't be recorded; `type` names the document it is about. */
export class ConsentError extends Error {
  readonly code: ConsentErrorCode;
  readonly type: LegalDocumentType | undefined;

  constructor(code: ConsentErrorCode, type?: LegalDocumentType) {
    super(`legal: consent ${code}${type ? ` (${type})` : ""}`);
    this.name = "ConsentError";
    this.code = code;
    this.type = type;
  }
}
