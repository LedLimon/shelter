import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { VARIANT_FORMATS, VARIANT_WIDTHS } from "@/lib/media/constraints";
import type { MediaKind, MediaStatus } from "@/generated/prisma/enums";
import type { StaffUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { startWorker } from "@/server/jobs/worker";
import { completeUpload, discardUpload, requestUpload } from "@/server/media";
import { cleanupMedia, processMedia } from "@/server/media/jobs";
import { variantKey } from "@/server/media/keys";
import { getStorage } from "@/server/storage";
import { clearOutbox, eventually, logged, testLogger } from "../jobs/helpers";
import {
  createBucket,
  createStaff,
  hasExif,
  mediaRow,
  phonePhoto,
  putFile,
  runWorker,
  stored,
  storedVariants,
} from "./helpers";

// What the worker does with an upload: real sharp, Postgres and MinIO.

let editor: StaffUser;
let photo: Buffer;

beforeAll(async () => {
  await createBucket();
  editor = await createStaff("EDITOR");
  photo = await phonePhoto();
});

beforeEach(clearOutbox);

/** A file uploaded and handed to the worker, as the browser does it. */
async function upload(bytes: Uint8Array = photo, kind: MediaKind = "PHOTO") {
  const ticket = await requestUpload(getDb(), editor, {
    kind,
    mime: "image/jpeg",
    byteSize: bytes.length,
  });
  expect((await putFile(ticket, bytes)).status).toBe(200);
  await completeUpload(getDb(), editor, ticket.id);
  return ticket.id;
}

async function variants(mediaId: string) {
  return Promise.all(
    VARIANT_WIDTHS.flatMap((width) =>
      VARIANT_FORMATS.map(async (format) => ({
        width,
        format,
        data: (await stored(variantKey(mediaId, width, format)))!,
      })),
    ),
  );
}

const outboxTypes = async () =>
  (await getDb().outbox.findMany({ orderBy: { createdAt: "asc" } })).map(
    ({ type, payload }) => ({ type, payload }),
  );

describe("the media.process job", () => {
  it("makes the public versions without EXIF and GPS", async () => {
    expect(await hasExif(photo)).toBe(true);
    const id = await upload();

    await runWorker();

    expect(await mediaRow(id)).toMatchObject({
      status: "READY",
      width: 1200,
      height: 900,
      blur: expect.stringMatching(/^data:image\/webp;base64,/) as string,
      failure: null,
    });
    const made = await variants(id);
    expect(made).toHaveLength(8);
    for (const { width, format, data } of made) {
      const metadata = await sharp(data).metadata();
      expect(metadata.width, `${width}.${format}`).toBe(Math.min(width, 1200));
      expect(metadata.format).toBe(format === "avif" ? "heif" : "webp");
      expect(metadata.exif, `${width}.${format}`).toBeUndefined();
      expect(metadata.xmp).toBeUndefined();
      expect(data.includes("ShelterPhone")).toBe(false);
    }
  });

  it("keeps the original as it came, in the private bucket", async () => {
    const id = await upload();

    await runWorker();

    const { storageKey } = (await mediaRow(id))!;
    expect(await stored(storageKey)).toEqual(photo);
  });

  it("changes nothing when it runs again", async () => {
    const id = await upload();
    await runWorker();
    const ready = await mediaRow(id);
    const before = await variants(id);

    await processMedia(id);
    await processMedia(id);

    expect(await mediaRow(id)).toEqual(ready);
    expect(await variants(id)).toEqual(before);
  });

  it("finishes a run that was cut off halfway", async () => {
    const id = await upload();
    await runWorker();
    const complete = await variants(id);
    // As if the worker died after writing some of the versions, before READY.
    await getDb().media.update({
      where: { id },
      data: { status: "UPLOADED", width: null, height: null, blur: null },
    });
    await getStorage().delete(variantKey(id, 1600, "avif"));
    await getStorage().delete(variantKey(id, 320, "webp"));

    // The retry — twice at once, as two workers would after a lost claim.
    await Promise.all([processMedia(id), processMedia(id)]);

    expect(await mediaRow(id)).toMatchObject({
      status: "READY",
      width: 1200,
      height: 900,
    });
    expect(await variants(id)).toEqual(complete);
  });

  it("fails a file that is not an image, for good", async () => {
    const html = Buffer.from("<!doctype html><script>alert(1)</script>");
    const id = await upload(html);

    await runWorker();

    expect(await mediaRow(id)).toMatchObject({
      status: "FAILED",
      failure: "not-an-image",
      width: null,
      blur: null,
    });
    expect(await storedVariants(id)).toEqual([]);
    // Not an error to retry: the job is done.
    await processMedia(id);
    expect(await mediaRow(id)).toMatchObject({ status: "FAILED" });
  });

  it("fails a file that is gone from the storage", async () => {
    const id = await upload();
    await getStorage().delete((await mediaRow(id))!.storageKey);

    await runWorker();

    expect(await mediaRow(id)).toMatchObject({
      status: "FAILED",
      failure: "missing",
    });
  });

  it("does nothing for a media that was discarded before it ran", async () => {
    await expect(processMedia("no-such-media")).resolves.toBeUndefined();
  });

  it("leaves no files of a media discarded while it was being processed", async () => {
    const id = await upload();
    const { storageKey } = (await mediaRow(id))!;
    // The uploader takes the file back when the first version is being
    // written: the row goes, and its purge runs before the rest is stored.
    const put = vi.spyOn(getStorage(), "put");
    put.mockImplementationOnce(async (...args) => {
      await discardUpload(getDb(), editor, id);
      await runWorker();
      put.mockRestore();
      return getStorage().put(...args);
    });

    await processMedia(id);

    expect(await mediaRow(id)).toBeNull();
    expect(await storedVariants(id)).toEqual([]);
    expect(await stored(storageKey)).toBeNull();
  });

  it("turns a sideways phone photo upright", async () => {
    const sideways = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 9, g: 9, b: 9 },
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const id = await upload(sideways);

    await runWorker();

    expect(await mediaRow(id)).toMatchObject({
      status: "READY",
      width: 600,
      height: 800,
    });
  });
});

describe("the worker process", () => {
  it("processes an upload through the outbox and pg-boss", async () => {
    const logger = testLogger();
    const worker = await startWorker({
      logger,
      outbox: { pollIntervalMs: 10 },
      jobs: { pollingIntervalSeconds: 0.5 },
    });
    try {
      const id = await upload();

      await eventually(async () => {
        expect(await mediaRow(id)).toMatchObject({ status: "READY" });
      });
      expect(await storedVariants(id)).toHaveLength(8);
    } finally {
      await worker.stop(5_000);
    }
    expect(logged(logger, "error")).toEqual([]);
    // The nightly sweep is on the schedule.
    expect(
      await getDb().$queryRaw`
        SELECT "name", "cron" FROM pgboss.schedule WHERE "name" LIKE 'media.%'`,
    ).toEqual([{ name: "media.cleanup", cron: "30 3 * * *" }]);
  });
});

describe("the media.cleanup job", () => {
  const HOUR = 60 * 60 * 1000;
  const ago = (ms: number) => new Date(Date.now() - ms);

  /** A media row of the given age; `updatedAt` is when its upload completed. */
  async function aged(
    status: MediaStatus,
    ageMs: number,
    { withFile = false } = {},
  ) {
    const id = withFile ? await upload() : undefined;
    if (id) await clearOutbox();
    const media = id
      ? await getDb().media.update({ where: { id }, data: { status } })
      : await getDb().media.create({
          data: {
            storageKey: `originals/aged-${Math.random()}`,
            mime: "image/jpeg",
            kind: "PHOTO",
            byteSize: 1,
            status,
            uploadedById: editor.id,
          },
        });
    // Prisma sets updatedAt itself on every write through the client.
    await getDb().$executeRaw`
      UPDATE "Media" SET "createdAt" = ${ago(ageMs)}, "updatedAt" = ${ago(ageMs)}
      WHERE "id" = ${media.id}`;
    return media;
  }

  beforeEach(async () => {
    // Tests of this file share the table: start from what this test makes.
    await getDb().media.updateMany({ data: { status: "READY" } });
  });

  it("removes uploads that never arrived or failed, a day later", async () => {
    const abandoned = await aged("PENDING", 25 * HOUR);
    const failed = await aged("FAILED", 25 * HOUR, { withFile: true });
    const fresh = await aged("PENDING", 23 * HOUR);
    const ready = await aged("READY", 25 * HOUR);

    const result = await cleanupMedia();

    expect(result).toEqual({ removed: 2, requeued: 0, givenUp: 0 });
    expect(await mediaRow(abandoned.id)).toBeNull();
    expect(await mediaRow(failed.id)).toBeNull();
    expect(await mediaRow(fresh.id)).not.toBeNull();
    expect(await mediaRow(ready.id)).not.toBeNull();
    // The files follow once the outbox runs.
    expect(await stored(failed.storageKey)).not.toBeNull();
    await runWorker();
    expect(await stored(failed.storageKey)).toBeNull();
  });

  it("restarts processing that got stuck", async () => {
    const stuck = await aged("UPLOADED", 2 * HOUR, { withFile: true });
    const inProgress = await aged("UPLOADED", 0.5 * HOUR);

    const result = await cleanupMedia();

    expect(result).toEqual({ removed: 0, requeued: 1, givenUp: 0 });
    expect(await outboxTypes()).toEqual([
      {
        type: "job.run",
        payload: { name: "media.process", payload: { mediaId: stuck.id } },
      },
    ]);
    await runWorker();
    expect(await mediaRow(stuck.id)).toMatchObject({ status: "READY" });
    expect(await mediaRow(inProgress.id)).toMatchObject({ status: "UPLOADED" });
  });

  it("gives up on processing after three days", async () => {
    const hopeless = await aged("UPLOADED", 73 * HOUR);

    const result = await cleanupMedia();

    expect(result).toEqual({ removed: 0, requeued: 0, givenUp: 1 });
    expect(await mediaRow(hopeless.id)).toMatchObject({
      status: "FAILED",
      failure: "stuck",
    });
    expect(await outboxTypes()).toEqual([]);
  });
});
