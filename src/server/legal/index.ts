import "server-only";
import { getEnv } from "@/lib/env";

// Legal documents with versions and the log of consents (docs/legal.md).
// The only code that writes LegalDocument and ConsentRecord; the triggers of
// the migration `legal_documents` guard what must never change.
export {
  LEGAL_DOCUMENT_TYPES,
  LEGAL_DOCUMENTS,
  legalHref,
  legalTypeOfSlug,
  MAX_LEGAL_BODY_LENGTH,
  parseLegalVersion,
  type LegalDocumentInfo,
} from "./catalog";
export {
  consentsSchema,
  noConsents,
  NOT_GIVEN,
  type ConsentDocument,
  type ConsentValue,
  type ConsentValues,
} from "./consent-input";
export {
  consentDocuments,
  marketingConsentOf,
  marketingConsentState,
  recordConsents,
  withdrawMarketingConsent,
  type ConsentSubject,
  type MarketingConsentState,
  type RecordConsentsInput,
  type RecordedConsent,
} from "./consents";
export {
  createLegalDraft,
  currentLegalDocument,
  deleteLegalDraft,
  legalDocumentStates,
  legalDraft,
  normalizeLegalBody,
  publishedLegalDocument,
  publishedLegalVersions,
  publishLegalDraft,
  saveLegalDraft,
  sha256Of,
  type LegalDocumentState,
  type LegalVersionSummary,
  type PublishedLegalDocument,
  type SavedLegalDraft,
} from "./documents";
export {
  ConsentError,
  LegalError,
  type ConsentErrorCode,
  type LegalErrorCode,
} from "./errors";
export { consentEvidence, type ConsentEvidence } from "./evidence";

/** The cache tag of everything public that shows a legal document. */
export const LEGAL_CACHE_TAG = "legal";

/**
 * The unsubscribe link of a newsletter: put it into every such letter, with
 * the id of the recipient's consent from marketingConsentOf(). The id is the
 * whole secret (a cuid2 can't be guessed) and carries no personal data; the
 * page behind it withdraws the consent only when its button is pressed, so a
 * mail scanner following links unsubscribes no one.
 */
export function unsubscribeUrl(consentId: string): string {
  return `${getEnv().APP_URL}${unsubscribePath(consentId)}`;
}

export function unsubscribePath(consentId: string): string {
  return `/unsubscribe/${encodeURIComponent(consentId)}`;
}
