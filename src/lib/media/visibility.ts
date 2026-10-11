import type { MediaKind, MediaStatus } from "@/generated/prisma/enums";

/**
 * Whether anyone may see the media's processed versions. A photo — once it
 * is processed. A receipt, an invoice or another document — only when staff
 * marked it redacted: personal data of third parties and card numbers are
 * painted over (docs/legal.md). Pages and the /media route both ask here.
 */
export function isPublicMedia(media: {
  kind: MediaKind;
  status: MediaStatus;
  redacted: boolean;
}): boolean {
  if (media.status !== "READY") return false;
  return media.kind === "PHOTO" || media.redacted;
}

/** Kinds that stay private until marked redacted. */
export function needsRedaction(kind: MediaKind): boolean {
  return kind !== "PHOTO";
}
