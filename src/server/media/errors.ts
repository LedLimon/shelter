import { UPLOAD_ERROR_MESSAGES } from "@/lib/media/messages";
import type { UploadErrorCode } from "@/lib/media/types";

const STATUS: Record<UploadErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  invalid: 400,
  "unsupported-type": 415,
  "too-large": 413,
  quota: 429,
  "not-found": 404,
  "not-uploaded": 409,
};

/**
 * An upload refused for a reason the user can act on. The message is for
 * them; the upload endpoints answer with it and with `status`.
 */
export class MediaError extends Error {
  override name = "MediaError";

  constructor(readonly code: UploadErrorCode) {
    super(UPLOAD_ERROR_MESSAGES[code]);
  }

  get status(): number {
    return STATUS[this.code];
  }
}
