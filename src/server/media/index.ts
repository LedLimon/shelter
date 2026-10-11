import "server-only";
import type { Media, PrismaClient } from "@/generated/prisma/client";
import type { MediaKind } from "@/generated/prisma/enums";
import { isUploadMimeType, MAX_UPLOAD_BYTES } from "@/lib/media/constraints";
import {
  MEDIA_FAILURES,
  type MediaFailure,
  type MediaState,
  type UploadTicket,
} from "@/lib/media/types";
import { needsRedaction } from "@/lib/media/visibility";
import type { Db } from "@/server/db";
import { enqueueJob, outbox } from "@/server/jobs";
import { getStorage } from "@/server/storage";
import { MediaError } from "./errors";
import { newOriginalKey } from "./keys";

export { MediaError } from "./errors";

// Uploaded photos and documents (docs/architecture.md#медиа):
//
//   requestUpload()  → a Media row (PENDING) and a URL the browser PUTs the
//                      file to, straight into the private bucket;
//   completeUpload() → UPLOADED, and the worker's "media.process" job makes
//                      the public versions (./jobs.ts) → READY or FAILED.
//
// The original never leaves the bucket; pages get processed versions from
// the /media route, which asks isPublicMedia() first.

/** How long an upload URL is valid: a 15 MB photo over a slow phone link. */
export const UPLOAD_URL_TTL_SECONDS = 15 * 60;

/**
 * Uploads one staff member may start per hour. A dog's whole album is a few
 * dozen; this stops a script, not a person.
 */
export const UPLOADS_PER_HOUR = 300;

const HOUR_MS = 60 * 60 * 1000;

export type UploadRequest = {
  kind: MediaKind;
  /** As the browser reports it: checked against the allowlist here. */
  mime: string;
  byteSize: number;
};

/** The staff member an upload belongs to. */
type Uploader = { id: string };

/**
 * Starts an upload: checks the type, the size and the uploader's hourly
 * quota, creates the Media and signs a URL for exactly this file — the
 * storage refuses another content type or length.
 */
export async function requestUpload(
  db: Db,
  user: Uploader,
  { kind, mime, byteSize }: UploadRequest,
): Promise<UploadTicket> {
  if (!isUploadMimeType(mime)) throw new MediaError("unsupported-type");
  if (byteSize > MAX_UPLOAD_BYTES) throw new MediaError("too-large");

  const recent = await db.media.count({
    where: {
      uploadedById: user.id,
      createdAt: { gt: new Date(Date.now() - HOUR_MS) },
    },
  });
  if (recent >= UPLOADS_PER_HOUR) throw new MediaError("quota");

  const storageKey = newOriginalKey();
  const { id } = await db.media.create({
    data: { storageKey, mime, kind, byteSize, uploadedById: user.id },
    select: { id: true },
  });
  const upload = await getStorage().presignUpload(storageKey, {
    contentType: mime,
    byteSize,
    expiresIn: UPLOAD_URL_TTL_SECONDS,
  });
  return { id, url: upload.url, headers: upload.headers };
}

/**
 * The browser says the file is in the bucket: check that it is and hand it
 * to the worker. Repeating the call changes nothing.
 */
export async function completeUpload(
  db: PrismaClient,
  user: Uploader,
  id: string,
): Promise<MediaState> {
  const media = await db.media.findUnique({ where: { id } });
  if (!media || media.uploadedById !== user.id) {
    throw new MediaError("not-found");
  }
  if (media.status !== "PENDING") return mediaStateOf(media);

  // The signed length makes another size impossible; the worker checks the
  // bytes themselves.
  const stored = await getStorage().size(media.storageKey);
  if (stored !== media.byteSize) throw new MediaError("not-uploaded");

  return db.$transaction(async (tx) => {
    // Two calls at once: only the one that moves the status starts the job.
    const { count } = await tx.media.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "UPLOADED" },
    });
    if (count === 1) await enqueueJob(tx, "media.process", { mediaId: id });
    return mediaStateOf(await tx.media.findUniqueOrThrow({ where: { id } }));
  });
}

/** What the uploader shows for these media; unknown ids are left out. */
export async function getMediaStates(
  db: Db,
  ids: readonly string[],
): Promise<MediaState[]> {
  const rows = await db.media.findMany({
    where: { id: { in: [...ids] }, status: { not: "PENDING" } },
  });
  return rows.map(mediaStateOf);
}

/**
 * Removes a media: its row now, its files once the caller's transaction
 * commits. Throws (P2003) if something still references the media — detach
 * it first, in the same transaction.
 */
export async function deleteMedia(
  tx: Db,
  media: Pick<Media, "id" | "storageKey">,
): Promise<void> {
  await tx.media.delete({ where: { id: media.id } });
  await outbox.enqueue(tx, "media.purge", {
    mediaId: media.id,
    storageKey: media.storageKey,
  });
}

/**
 * deleteMedia() for a file that may be attached to something: leaves an
 * attached one alone and returns false. Tables that attach media reference
 * it with onDelete: Restrict — that reference is the whole check, so a new
 * table is covered without a change here.
 *
 * Takes the client, not a transaction: the refused DELETE aborts the
 * transaction it runs in.
 */
export async function deleteMediaIfUnused(
  db: PrismaClient,
  media: Pick<Media, "id" | "storageKey">,
): Promise<boolean> {
  try {
    await db.$transaction((tx) => deleteMedia(tx, media));
    return true;
  } catch (error) {
    if (isForeignKeyViolation(error)) return false;
    throw error;
  }
}

/**
 * The uploader took a file back before saving the form. Only their own file,
 * and only while nothing uses it. Returns whether it was removed.
 */
export async function discardUpload(
  db: PrismaClient,
  user: Uploader,
  id: string,
): Promise<boolean> {
  const media = await db.media.findUnique({
    where: { id },
    select: { id: true, storageKey: true, uploadedById: true },
  });
  if (!media || media.uploadedById !== user.id) return false;
  return deleteMediaIfUnused(db, media);
}

/**
 * Marks a document as safe to publish — personal data of third parties and
 * card numbers are painted over — or takes the mark back. Photos have no
 * such mark. Returns the previous value, or null if nothing changed.
 */
export async function setMediaRedacted(
  db: Db,
  id: string,
  redacted: boolean,
): Promise<{ before: boolean } | null> {
  const media = await db.media.findUnique({
    where: { id },
    select: { kind: true, redacted: true },
  });
  if (!media) throw new MediaError("not-found");
  if (!needsRedaction(media.kind) || media.redacted === redacted) return null;
  await db.media.update({ where: { id }, data: { redacted } });
  return { before: media.redacted };
}

export function mediaStateOf(media: Media): MediaState {
  return {
    id: media.id,
    kind: media.kind,
    status: media.status,
    width: media.width,
    height: media.height,
    blur: media.blur,
    redacted: media.redacted,
    failure: isMediaFailure(media.failure) ? media.failure : null,
  };
}

function isMediaFailure(value: string | null): value is MediaFailure {
  return (MEDIA_FAILURES as readonly string[]).includes(value ?? "");
}

/** Prisma's P2003; checked by shape, like describeError() does. */
function isForeignKeyViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === "PrismaClientKnownRequestError" &&
    "code" in error &&
    error.code === "P2003"
  );
}
