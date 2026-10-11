// The legal documents of the site (docs/legal.md): their names and public
// addresses. Pure and free of server imports, like permissions.ts: forms and
// the admin read it in the browser too.
import type { LegalDocumentType } from "@/generated/prisma/enums";

/** Characters of a document's text; an offer with every annex is a tenth of this. */
export const MAX_LEGAL_BODY_LENGTH = 200_000;

export type LegalDocumentInfo = {
  /** The public address: /legal/<slug>. */
  slug: string;
  /** The heading of the document's page. */
  title: string;
  /** For the owner: what the text is for and where it is used. */
  about: string;
};

export const LEGAL_DOCUMENTS = {
  OFFER: {
    slug: "offer",
    title: "Оферта о пожертвовании",
    about:
      "Условия, на которых приют принимает пожертвования. Донор принимает оферту галочкой перед оплатой, а у каждого пожертвования записана её версия.",
  },
  PRIVACY: {
    slug: "privacy",
    title: "Политика обработки персональных данных",
    about:
      "Какие данные собирает сайт, зачем и как их удалить. Должна быть опубликована до начала сбора данных.",
  },
  PD_CONSENT: {
    slug: "consent",
    title: "Согласие на обработку персональных данных",
    about:
      "Текст согласия, которое человек даёт отдельной галочкой, когда оставляет почту или телефон.",
  },
  RECURRING: {
    slug: "recurring",
    title: "Условия ежемесячных пожертвований",
    about:
      "Как работают регулярные списания: сумма, периодичность, как отменить. Донор соглашается отдельной галочкой, когда оформляет ежемесячную помощь.",
  },
  MARKETING: {
    slug: "marketing",
    title: "Согласие на рассылку",
    about:
      "Согласие получать новости приюта на почту. Необязательное: его можно не давать и в любой момент отозвать по ссылке в письме.",
  },
} as const satisfies Record<LegalDocumentType, LegalDocumentInfo>;

/** In the order the admin and the public pages list them. */
export const LEGAL_DOCUMENT_TYPES = Object.keys(
  LEGAL_DOCUMENTS,
) as LegalDocumentType[];

export function legalTypeOfSlug(slug: string): LegalDocumentType | undefined {
  return LEGAL_DOCUMENT_TYPES.find(
    (type) => LEGAL_DOCUMENTS[type].slug === slug,
  );
}

/**
 * The document's public page: the version in force, or — with `version` — the
 * permanent address of that version, which outlives its replacement.
 */
export function legalHref(type: LegalDocumentType, version?: number): string {
  const base = `/legal/${LEGAL_DOCUMENTS[type].slug}`;
  return version === undefined ? base : `${base}/${version}`;
}

/** The whole positive number of a version in an address, or undefined. */
export function parseLegalVersion(segment: string): number | undefined {
  if (!/^[1-9]\d{0,8}$/.test(segment)) return undefined;
  return Number(segment);
}
