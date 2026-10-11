import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as complete } from "@/app/api/upload/complete/route";
import { POST as discard } from "@/app/api/upload/discard/route";
import { POST as presign } from "@/app/api/upload/presign/route";
import { GET as status } from "@/app/api/upload/status/route";
import { MAX_UPLOAD_BYTES } from "@/lib/media/constraints";
import {
  MEDIA_FAILURE_MESSAGES,
  UPLOAD_ERROR_MESSAGES,
} from "@/lib/media/messages";
import type { UploadErrorBody } from "@/lib/media/types";
import type { StaffUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { UPLOADS_PER_HOUR } from "@/server/media";
import { clearOutbox } from "../jobs/helpers";
import {
  anonymousGet,
  createBucket,
  createStaff,
  jsonRequest,
  mediaRow,
  ORIGIN,
  phonePhoto,
  putFile,
  runWorker,
  stored,
  storedVariants,
  type MediaState,
  type UploadTicket,
} from "./helpers";

// The upload endpoints below the browser: real route handlers, Postgres and
// MinIO. Only the session is faked.
const mocks = vi.hoisted(() => ({
  getStaffUser: vi.fn<() => Promise<StaffUser | null>>(),
}));
vi.mock("@/server/auth/session", () => ({
  getStaffUser: mocks.getStaffUser,
}));

let editor: StaffUser;
let photo: Buffer;

beforeAll(async () => {
  await createBucket();
  editor = await createStaff("EDITOR");
  photo = await phonePhoto();
});

beforeEach(async () => {
  vi.resetAllMocks();
  mocks.getStaffUser.mockResolvedValue(editor);
  await clearOutbox();
});

const validUpload = () => ({
  kind: "PHOTO",
  mime: "image/jpeg",
  byteSize: photo.length,
});

async function refusal(response: Response) {
  const { error } = (await response.json()) as UploadErrorBody;
  return { status: response.status, ...error };
}

async function requestUpload(input: unknown = validUpload()) {
  const response = await presign(jsonRequest("/api/upload/presign", input));
  expect(response.status).toBe(201);
  return (await response.json()) as UploadTicket;
}

/** A file in the bucket whose upload was not completed yet. */
async function uploadedFile(bytes: Uint8Array = photo, kind = "PHOTO") {
  const ticket = await requestUpload({
    kind,
    mime: "image/jpeg",
    byteSize: bytes.length,
  });
  expect((await putFile(ticket, bytes)).status).toBe(200);
  return ticket;
}

const completeUpload = (id: string) =>
  complete(jsonRequest("/api/upload/complete", { id }));

const mediaCount = () => getDb().media.count();

describe("POST /api/upload/presign", () => {
  it("gives a URL that takes exactly the declared file", async () => {
    const ticket = await requestUpload();

    expect(await mediaRow(ticket.id)).toMatchObject({
      status: "PENDING",
      kind: "PHOTO",
      mime: "image/jpeg",
      byteSize: photo.length,
      uploadedById: editor.id,
      redacted: false,
    });
    expect(ticket.headers).toEqual({ "Content-Type": "image/jpeg" });

    // Another size or type than was signed: the storage refuses.
    expect((await putFile(ticket, photo.subarray(1))).status).toBe(403);
    expect(
      (await putFile(ticket, photo, { "Content-Type": "text/html" })).status,
    ).toBe(403);
    expect((await putFile(ticket, photo)).status).toBe(200);
  });

  it("keeps the uploaded original private", async () => {
    const ticket = await uploadedFile();
    const { storageKey } = (await mediaRow(ticket.id))!;

    expect(await stored(storageKey)).toEqual(photo);
    expect((await anonymousGet(storageKey)).status).toBe(403);
    // The upload URL is for writing: it doesn't read the file back.
    expect((await fetch(ticket.url)).ok).toBe(false);
  });

  it("refuses a visitor without a staff session", async () => {
    mocks.getStaffUser.mockResolvedValue(null);
    const before = await mediaCount();

    const response = await presign(
      jsonRequest("/api/upload/presign", validUpload()),
    );

    expect(await refusal(response)).toEqual({
      status: 401,
      code: "unauthorized",
      message: UPLOAD_ERROR_MESSAGES.unauthorized,
    });
    expect(await mediaCount()).toBe(before);
  });

  it("refuses staff whose role doesn't upload", async () => {
    mocks.getStaffUser.mockResolvedValue(await createStaff("COORDINATOR"));
    const before = await mediaCount();

    // A body that would not pass either: the role is checked first.
    const response = await presign(jsonRequest("/api/upload/presign", "{"));

    expect(await refusal(response)).toEqual({
      status: 403,
      code: "forbidden",
      message: UPLOAD_ERROR_MESSAGES.forbidden,
    });
    expect(await mediaCount()).toBe(before);
  });

  it.each(["ADMIN", "OWNER"] as const)("lets %s upload", async (role) => {
    mocks.getStaffUser.mockResolvedValue(await createStaff(role));

    const response = await presign(
      jsonRequest("/api/upload/presign", validUpload()),
    );

    expect(response.status).toBe(201);
  });

  it.each([
    "image/gif",
    "image/heic",
    "image/svg+xml",
    "application/pdf",
    "text/html",
    "",
  ])("refuses the type %j", async (mime) => {
    const before = await mediaCount();

    const response = await presign(
      jsonRequest("/api/upload/presign", { ...validUpload(), mime }),
    );

    expect(await refusal(response)).toEqual({
      status: 415,
      code: "unsupported-type",
      message:
        "Этот формат не подходит. Загрузите фото в JPEG, PNG, WebP или HEIC.",
    });
    expect(await mediaCount()).toBe(before);
  });

  it("refuses a file over 15 MB and takes one of exactly 15 MB", async () => {
    const before = await mediaCount();

    const tooLarge = await presign(
      jsonRequest("/api/upload/presign", {
        ...validUpload(),
        byteSize: MAX_UPLOAD_BYTES + 1,
      }),
    );

    expect(await refusal(tooLarge)).toEqual({
      status: 413,
      code: "too-large",
      message: "Файл больше 15 МБ. Уменьшите фото или выберите другое.",
    });
    expect(await mediaCount()).toBe(before);

    await requestUpload({ ...validUpload(), byteSize: MAX_UPLOAD_BYTES });
  });

  it.each([
    [
      "an empty file",
      { ...{ kind: "PHOTO", mime: "image/jpeg" }, byteSize: 0 },
    ],
    ["a negative size", { kind: "PHOTO", mime: "image/jpeg", byteSize: -5 }],
    ["a fractional size", { kind: "PHOTO", mime: "image/jpeg", byteSize: 1.5 }],
    ["a size as text", { kind: "PHOTO", mime: "image/jpeg", byteSize: "9" }],
    ["an unknown kind", { kind: "AVATAR", mime: "image/jpeg", byteSize: 9 }],
    ["no fields", {}],
    ["broken JSON", "{"],
  ])("refuses %s", async (_name, body) => {
    const before = await mediaCount();

    const response = await presign(jsonRequest("/api/upload/presign", body));

    expect(await refusal(response)).toMatchObject({
      status: 400,
      code: "invalid",
    });
    expect(await mediaCount()).toBe(before);
  });

  it("refuses a request sent from another site", async () => {
    const response = await presign(
      jsonRequest("/api/upload/presign", validUpload(), {
        origin: "https://evil.example",
      }),
    );

    expect(await refusal(response)).toMatchObject({
      status: 403,
      code: "forbidden",
    });
    expect(mocks.getStaffUser).not.toHaveBeenCalled();
  });

  it("stops at the hourly quota, per uploader", async () => {
    const busy = await createStaff("EDITOR");
    await getDb().media.createMany({
      data: Array.from({ length: UPLOADS_PER_HOUR }, (_, index) => ({
        storageKey: `originals/quota-${index}`,
        mime: "image/jpeg",
        kind: "PHOTO" as const,
        byteSize: 1,
        uploadedById: busy.id,
      })),
    });
    mocks.getStaffUser.mockResolvedValue(busy);

    const response = await presign(
      jsonRequest("/api/upload/presign", validUpload()),
    );

    expect(await refusal(response)).toMatchObject({
      status: 429,
      code: "quota",
    });
    // Someone else's uploads don't count.
    mocks.getStaffUser.mockResolvedValue(editor);
    await requestUpload();
  });
});

describe("POST /api/upload/complete", () => {
  it("hands an uploaded file to the worker, once", async () => {
    const { id } = await uploadedFile();

    const response = await completeUpload(id);

    expect(response.status).toBe(200);
    expect((await response.json()) as MediaState).toEqual({
      id,
      kind: "PHOTO",
      status: "UPLOADED",
      width: null,
      height: null,
      blur: null,
      redacted: false,
      failure: null,
    });
    const events = () =>
      getDb().outbox.findMany({ select: { type: true, payload: true } });
    const job = {
      type: "job.run",
      payload: { name: "media.process", payload: { mediaId: id } },
    };
    expect(await events()).toEqual([job]);

    // The browser retried the call, twice at once.
    const again = await Promise.all([completeUpload(id), completeUpload(id)]);

    expect(again.map(({ status }) => status)).toEqual([200, 200]);
    expect(await events()).toEqual([job]);
  });

  it("refuses a file that never reached the storage", async () => {
    const { id } = await requestUpload();

    const response = await completeUpload(id);

    expect(await refusal(response)).toEqual({
      status: 409,
      code: "not-uploaded",
      message: UPLOAD_ERROR_MESSAGES["not-uploaded"],
    });
    expect(await mediaRow(id)).toMatchObject({ status: "PENDING" });
    expect(await getDb().outbox.count()).toBe(0);
  });

  it("refuses someone else's upload and an unknown id", async () => {
    const { id } = await uploadedFile();
    mocks.getStaffUser.mockResolvedValue(await createStaff("EDITOR"));

    for (const target of [id, "no-such-media"]) {
      expect(await refusal(await completeUpload(target))).toMatchObject({
        status: 404,
        code: "not-found",
      });
    }
    expect(await mediaRow(id)).toMatchObject({ status: "PENDING" });
  });

  it("refuses an upload that was discarded while it was being completed", async () => {
    const { id } = await uploadedFile();

    // The uploader cancels at the very moment the file is confirmed.
    const [completed, discarded] = await Promise.all([
      completeUpload(id),
      discard(jsonRequest("/api/upload/discard", { id })),
    ]);

    expect(discarded.status).toBe(200);
    // Either order is fine; a server error is not.
    expect([200, 404]).toContain(completed.status);
    expect(await mediaRow(id)).toBeNull();
  });

  it("needs the session and the role", async () => {
    const { id } = await uploadedFile();

    mocks.getStaffUser.mockResolvedValue(null);
    expect((await completeUpload(id)).status).toBe(401);
    mocks.getStaffUser.mockResolvedValue(await createStaff("COORDINATOR"));
    expect((await completeUpload(id)).status).toBe(403);

    expect(await mediaRow(id)).toMatchObject({ status: "PENDING" });
  });
});

describe("GET /api/upload/status", () => {
  const statusOf = (...ids: string[]) =>
    status(
      new Request(
        `${ORIGIN}/api/upload/status?${ids.map((id) => `id=${id}`).join("&")}`,
      ),
    );

  it("follows a file from upload to ready", async () => {
    const { id } = await uploadedFile();
    const items = async () =>
      (
        (await (await statusOf(id, "unknown")).json()) as {
          items: MediaState[];
        }
      ).items;

    // Not completed yet: not a file of the form.
    expect(await items()).toEqual([]);

    await completeUpload(id);
    expect(await items()).toMatchObject([{ id, status: "UPLOADED" }]);

    await runWorker();
    expect(await items()).toMatchObject([
      {
        id,
        status: "READY",
        width: 1200,
        height: 900,
        blur: expect.stringMatching(/^data:image\/webp;base64,/) as string,
        failure: null,
      },
    ]);
  });

  it("says why a file failed, in words for the user", async () => {
    const notAnImage = Buffer.from("<!doctype html><title>not a photo</title>");
    const { id } = await uploadedFile(notAnImage);
    await completeUpload(id);
    await runWorker();

    const { items } = (await (await statusOf(id)).json()) as {
      items: MediaState[];
    };

    expect(items).toMatchObject([
      { id, status: "FAILED", failure: "not-an-image" },
    ]);
    expect(MEDIA_FAILURE_MESSAGES[items[0]!.failure!]).toContain(
      "не открывается как изображение",
    );
  });

  it("needs the session, the role and ids", async () => {
    expect((await statusOf()).status).toBe(400);
    mocks.getStaffUser.mockResolvedValue(null);
    expect((await statusOf("a")).status).toBe(401);
    mocks.getStaffUser.mockResolvedValue(await createStaff("COORDINATOR"));
    expect((await statusOf("a")).status).toBe(403);
  });
});

describe("POST /api/upload/discard", () => {
  const discardUpload = async (id: string) => {
    const response = await discard(jsonRequest("/api/upload/discard", { id }));
    expect(response.status).toBe(200);
    return ((await response.json()) as { discarded: boolean }).discarded;
  };

  it("removes the uploader's own file: the row now, the files after", async () => {
    const { id } = await uploadedFile();
    await completeUpload(id);
    await runWorker();
    const { storageKey } = (await mediaRow(id))!;
    expect(await storedVariants(id)).toHaveLength(8);

    expect(await discardUpload(id)).toBe(true);

    expect(await mediaRow(id)).toBeNull();
    await runWorker();
    expect(await stored(storageKey)).toBeNull();
    expect(await storedVariants(id)).toEqual([]);

    // Again, or for a file that never was: nothing to do.
    expect(await discardUpload(id)).toBe(false);
  });

  it("removes a file once when two requests ask at the same time", async () => {
    const { id } = await uploadedFile();

    const answers = await Promise.all([discardUpload(id), discardUpload(id)]);

    expect(answers.sort()).toEqual([false, true]);
    expect(await mediaRow(id)).toBeNull();
    expect(await getDb().outbox.count({ where: { type: "media.purge" } })).toBe(
      1,
    );
  });

  it("leaves someone else's file alone", async () => {
    const { id } = await uploadedFile();
    mocks.getStaffUser.mockResolvedValue(await createStaff("EDITOR"));

    expect(await discardUpload(id)).toBe(false);

    expect(await mediaRow(id)).not.toBeNull();
  });

  it("leaves a file that something already uses", async () => {
    const { id } = await uploadedFile();
    // Stands in for DogMedia, NeedMedia, ExpenseMedia: tables that attach
    // media reference it with ON DELETE RESTRICT.
    await getDb().$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TestAttachment" (
        "mediaId" TEXT NOT NULL REFERENCES "Media"("id") ON DELETE RESTRICT
      )`);
    await getDb().$executeRaw`
      INSERT INTO "TestAttachment" ("mediaId") VALUES (${id})`;

    expect(await discardUpload(id)).toBe(false);

    expect(await mediaRow(id)).not.toBeNull();
    expect(await getDb().outbox.count()).toBe(0);
  });

  it("needs the session and the role", async () => {
    const { id } = await uploadedFile();
    const request = () => jsonRequest("/api/upload/discard", { id });

    mocks.getStaffUser.mockResolvedValue(null);
    expect((await discard(request())).status).toBe(401);
    mocks.getStaffUser.mockResolvedValue(await createStaff("COORDINATOR"));
    expect((await discard(request())).status).toBe(403);

    expect(await mediaRow(id)).not.toBeNull();
  });
});
