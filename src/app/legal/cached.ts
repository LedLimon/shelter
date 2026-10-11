import "server-only";
import { unstable_cache } from "next/cache";
import type { LegalDocumentType } from "@/generated/prisma/enums";
import { getDb } from "@/server/db";
import {
  currentLegalDocument,
  LEGAL_CACHE_TAG,
  publishedLegalDocument,
  publishedLegalVersions,
} from "@/server/legal";
import { getSettings } from "@/server/settings";

/** What a legal page shows; times are ISO strings (the cache keeps JSON). */
export type LegalPageData = {
  /** The shelter's time zone, for the dates. */
  timeZone: string;
  /** The requested version; null if it was never published. */
  document: {
    version: number;
    body: string;
    sha256: string;
    effectiveAt: string;
  } | null;
  /** Every published version, the newest (the one in force) first. */
  versions: { version: number; effectiveAt: string }[];
};

/**
 * A document's version — the one in force when `version` is null — with the
 * list of all versions. Cached until a version is published (the `legal`
 * tag, expired by the admin's action) or the time zone changes.
 */
export const getLegalPageData = unstable_cache(
  async (
    type: LegalDocumentType,
    version: number | null,
  ): Promise<LegalPageData> => {
    const db = getDb();
    const document =
      version === null
        ? await currentLegalDocument(db, type)
        : await publishedLegalDocument(db, type, version);
    const versions = await publishedLegalVersions(db, type);
    const settings = await getSettings(db);

    return {
      timeZone: settings["shelter.timezone"],
      document: document && {
        version: document.version,
        body: document.body,
        sha256: document.sha256,
        effectiveAt: document.effectiveAt.toISOString(),
      },
      versions: versions.map(({ version: number, effectiveAt }) => ({
        version: number,
        effectiveAt: effectiveAt.toISOString(),
      })),
    };
  },
  ["legal-page"],
  { tags: [LEGAL_CACHE_TAG, "settings"] },
);
