// What a form with consent boxes holds and sends (docs/legal.md). Pure and
// free of server imports: the form's schema runs in the browser too.
import { z } from "zod";
import type { LegalDocumentType } from "@/generated/prisma/enums";

/** A version in force that a consent box links to; serializable. */
export type ConsentDocument = {
  id: string;
  type: LegalDocumentType;
  version: number;
};

/**
 * The value of one box: the id of the version it was ticked next to, or ""
 * while it is not ticked. Not a boolean on purpose: the server learns which
 * text the person saw, and a box ticked for an older version no longer counts
 * as ticked once the form shows a newer one.
 */
export type ConsentValue = string;

/** The value of an unticked box. */
export const NOT_GIVEN: ConsentValue = "";

/** A form's consents by document type. */
export type ConsentValues<Type extends LegalDocumentType = LegalDocumentType> =
  Record<Type, ConsentValue>;

/**
 * Default values of a form's consents: every box unticked. The law asks for
 * a consent to be a person's own action, so a form never starts with one.
 */
export function noConsents<Type extends LegalDocumentType>(
  types: readonly Type[],
): ConsentValues<Type> {
  return Object.fromEntries(
    types.map((type) => [type, NOT_GIVEN]),
  ) as ConsentValues<Type>;
}

/**
 * The zod schema of a form's consents, shared by the form and its server
 * action. `required` maps a document to the message shown while its box is
 * not ticked; `optional` lists boxes the form can go without.
 *
 * ```ts
 * consents: consentsSchema({
 *   required: {
 *     OFFER: "Чтобы помочь, примите условия оферты.",
 *     PD_CONSENT: "Без согласия на обработку данных мы не сможем принять пожертвование.",
 *   },
 *   optional: ["MARKETING"],
 * })
 * ```
 */
export function consentsSchema<
  Required extends LegalDocumentType,
  Optional extends LegalDocumentType = never,
>({
  required,
  optional = [],
}: {
  required: Record<Required, string>;
  optional?: readonly Optional[];
}) {
  const shape: Record<string, z.ZodType<string, string>> = {};
  for (const type of Object.keys(required) as Required[]) {
    shape[type] = consentValue().min(1, required[type]);
  }
  for (const type of optional) shape[type] = consentValue();
  return z.object(shape) as unknown as z.ZodType<
    ConsentValues<Required | Optional>,
    ConsentValues<Required | Optional>
  >;
}

/** A document id, or "": ids are cuid2, 24 characters. */
const consentValue = () => z.string().max(64);
