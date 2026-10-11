// What an upload may be and what the worker makes of it. Shared by the
// browser (MediaUploader) and the server; free of server imports.

/**
 * Content types the upload endpoint accepts. HEIC is not among them: sharp
 * can't decode it, so the browser converts it to JPEG first.
 */
export const UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type UploadMimeType = (typeof UPLOAD_MIME_TYPES)[number];

export function isUploadMimeType(mime: string): mime is UploadMimeType {
  return (UPLOAD_MIME_TYPES as readonly string[]).includes(mime);
}

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
/** For messages: «до 15 МБ». */
export const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024);

/**
 * Widths of the processed versions, in pixels. An original narrower than a
 * width is not enlarged: that version keeps the original's width.
 */
export const VARIANT_WIDTHS = [320, 640, 1024, 1600] as const;
export type VariantWidth = (typeof VARIANT_WIDTHS)[number];

/** Every width comes in both formats; the best one the browser takes is served. */
export const VARIANT_FORMATS = ["avif", "webp"] as const;
export type VariantFormat = (typeof VARIANT_FORMATS)[number];

/** How many files one GET /api/upload/status may ask about. */
export const MAX_STATUS_IDS = 50;

/** The smallest processed width that covers `width`, or the largest there is. */
export function variantWidthFor(width: number): VariantWidth {
  return (
    VARIANT_WIDTHS.find((variant) => variant >= width) ??
    VARIANT_WIDTHS[VARIANT_WIDTHS.length - 1]!
  );
}
