import { z } from "zod";
import { LegalDocumentType } from "@/generated/prisma/enums";
import { MAX_LEGAL_BODY_LENGTH } from "@/server/legal/catalog";

const documentId = z.string().min(1).max(64);

/** The draft's editor: the form and saveDraft() share it. */
export const draftFormSchema = z.object({
  id: documentId,
  body: z
    .string()
    .refine((text) => text.trim() !== "", "Введите текст документа.")
    .max(
      MAX_LEGAL_BODY_LENGTH,
      `Текст слишком длинный: помещается до ${MAX_LEGAL_BODY_LENGTH.toLocaleString("ru-RU")} знаков.`,
    ),
});
export type DraftFormValues = z.input<typeof draftFormSchema>;

export const createDraftSchema = z.object({ type: z.enum(LegalDocumentType) });

export const publishDraftSchema = z.object({
  id: documentId,
  /** The hash of the saved text the owner confirmed. */
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export const deleteDraftSchema = z.object({ id: documentId });
