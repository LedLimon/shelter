import "server-only";
import { MAX_UPLOAD_BYTES } from "@/lib/media/constraints";
import type { MediaFailure } from "@/lib/media/types";
import { getDb } from "@/server/db";
import { enqueueJob } from "@/server/jobs";
import { getStorage } from "@/server/storage";
import { deleteMediaIfUnused } from "./index";
import { variantKey, variantKeys } from "./keys";
import { processImage, UnprocessableImageError } from "./process";

// The worker's side of media: handlers of the "media.process" and
// "media.cleanup" jobs and of the "media.purge" outbox event
// (src/server/jobs/handlers.ts). Each may run more than once for the same
// media, so each is idempotent.

const HOUR_MS = 60 * 60 * 1000;
/** An upload that never arrived, or failed: its row and files go after this. */
const ABANDONED_AFTER_MS = 24 * HOUR_MS;
/** UPLOADED for longer than this: the job was lost or ran out of retries. */
const STUCK_AFTER_MS = HOUR_MS;
/** …and for longer than this: stop trying. */
const GIVE_UP_AFTER_MS = 3 * 24 * HOUR_MS;
/** Rows per cleanup run; the next night takes the rest. */
const CLEANUP_BATCH = 500;

/**
 * Makes the public versions of an uploaded original: every width in WebP and
 * AVIF, without EXIF and GPS, plus the blur placeholder — then READY. A file
 * that is not an image becomes FAILED and is not retried; a storage or
 * database error throws, and pg-boss retries the job.
 *
 * Safe to repeat: versions are written to the same keys with the same
 * bytes, and only an UPLOADED media is touched.
 */
export async function processMedia(
  mediaId: string,
  signal?: AbortSignal,
): Promise<void> {
  const db = getDb();
  const storage = getStorage();
  const media = await db.media.findUnique({
    where: { id: mediaId },
    select: { status: true, storageKey: true, byteSize: true },
  });
  // Discarded meanwhile, or another run got here first.
  if (!media || media.status !== "UPLOADED") return;

  const fail = async (failure: MediaFailure) => {
    await db.media.updateMany({
      where: { id: mediaId, status: "UPLOADED" },
      data: { status: "FAILED", failure },
    });
  };

  const original = await storage.get(media.storageKey, signal);
  if (!original) return fail("missing");
  // The upload URL allows only the declared size; a larger body here means
  // the object was replaced by other means.
  if (original.byteSize === null || original.byteSize > MAX_UPLOAD_BYTES) {
    await original.body.cancel();
    return fail("missing");
  }
  const bytes = new Uint8Array(await new Response(original.body).arrayBuffer());

  let processed;
  try {
    processed = await processImage(bytes);
  } catch (error) {
    if (error instanceof UnprocessableImageError) return fail(error.failure);
    throw error;
  }

  for (const { width, format, data } of processed.variants) {
    signal?.throwIfAborted();
    await storage.put(variantKey(mediaId, width, format), data, {
      contentType: `image/${format}`,
      signal,
    });
  }

  // READY only now: the /media route serves a READY media's versions.
  await db.media.updateMany({
    where: { id: mediaId, status: "UPLOADED" },
    data: {
      status: "READY",
      width: processed.width,
      height: processed.height,
      blur: processed.blur,
    },
  });
}

/**
 * Deletes the files of a media whose row is already gone: the original and
 * every processed version. Deleting what isn't there is not an error.
 */
export async function purgeMediaFiles(
  mediaId: string,
  storageKey: string,
  signal?: AbortSignal,
): Promise<void> {
  const storage = getStorage();
  for (const key of [storageKey, ...variantKeys(mediaId)]) {
    await storage.delete(key, signal);
  }
}

export type CleanupResult = {
  removed: number;
  requeued: number;
  givenUp: number;
};

/**
 * The nightly sweep:
 * - uploads that never arrived (PENDING) or failed, a day old — removed,
 *   files included, unless something references them;
 * - processing that got stuck (the job was lost with a long outage) —
 *   started again, and given up on after three days.
 */
export async function cleanupMedia(now = new Date()): Promise<CleanupResult> {
  const db = getDb();
  const before = (ms: number) => new Date(now.getTime() - ms);

  const abandoned = await db.media.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      createdAt: { lt: before(ABANDONED_AFTER_MS) },
    },
    select: { id: true, storageKey: true },
    orderBy: { createdAt: "asc" },
    take: CLEANUP_BATCH,
  });
  let removed = 0;
  for (const media of abandoned) {
    if (await deleteMediaIfUnused(db, media)) removed += 1;
  }

  // updatedAt of an UPLOADED media is when its upload completed.
  const { count: givenUp } = await db.media.updateMany({
    where: { status: "UPLOADED", updatedAt: { lt: before(GIVE_UP_AFTER_MS) } },
    data: { status: "FAILED", failure: "stuck" },
  });

  const stuck = await db.media.findMany({
    where: { status: "UPLOADED", updatedAt: { lt: before(STUCK_AFTER_MS) } },
    select: { id: true },
    orderBy: { updatedAt: "asc" },
    take: CLEANUP_BATCH,
  });
  for (const { id } of stuck) {
    await enqueueJob(db, "media.process", { mediaId: id });
  }

  return { removed, requeued: stuck.length, givenUp };
}
