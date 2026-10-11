import type { MediaKind, MediaStatus } from "@/generated/prisma/enums";

// What the browser knows about an uploaded file. Free of server imports.

/** Why the worker couldn't process a file: Media.failure. */
export const MEDIA_FAILURES = [
  /** Not a JPEG, PNG or WebP image, whatever the upload claimed; or broken. */
  "not-an-image",
  "too-many-pixels",
  /** The original is not in the storage, or is not the declared size. */
  "missing",
  /** Processing kept failing for days; see the worker's log. */
  "stuck",
] as const;
export type MediaFailure = (typeof MEDIA_FAILURES)[number];

/** A media as the uploader shows it: plain data, safe to pass to the browser. */
export type MediaState = {
  id: string;
  kind: MediaKind;
  /** PENDING never gets this far: the file is listed once it is uploaded. */
  status: MediaStatus;
  /** Of the upright original; null until READY. */
  width: number | null;
  height: number | null;
  /** Blurred placeholder (data URL); null until READY. */
  blur: string | null;
  redacted: boolean;
  failure: MediaFailure | null;
};

/** Refusals of the upload endpoints (`error.code` of their JSON answer). */
export type UploadErrorCode =
  | "unauthorized"
  | "forbidden"
  | "invalid"
  | "unsupported-type"
  | "too-large"
  | "quota"
  | "not-found"
  | "not-uploaded";

export type UploadErrorBody = {
  error: { code: UploadErrorCode; message: string };
};

/** What POST /api/upload/presign answers. */
export type UploadTicket = {
  /** The new Media's id. */
  id: string;
  /** PUT the file here, with exactly these headers. */
  url: string;
  headers: Record<string, string>;
};
