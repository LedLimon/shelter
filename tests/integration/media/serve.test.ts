import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/media/[id]/[width]/route";
import type { MediaKind } from "@/generated/prisma/enums";
import { mediaUrl } from "@/lib/media/url";
import type { StaffUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import {
  completeUpload,
  MediaError,
  requestUpload,
  setMediaRedacted,
} from "@/server/media";
import { processMedia } from "@/server/media/jobs";
import { variantKeys } from "@/server/media/keys";
import {
  anonymousGet,
  createBucket,
  createStaff,
  hasExif,
  mediaRow,
  ORIGIN,
  phonePhoto,
  putFile,
} from "./helpers";

// GET /media/{id}/{width}: what the public can and cannot get.
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

beforeEach(() => {
  vi.resetAllMocks();
  // A visitor, unless the test signs someone in.
  mocks.getStaffUser.mockResolvedValue(null);
});

async function uploaded(kind: MediaKind = "PHOTO") {
  const ticket = await requestUpload(getDb(), editor, {
    kind,
    mime: "image/jpeg",
    byteSize: photo.length,
  });
  await putFile(ticket, photo);
  await completeUpload(getDb(), editor, ticket.id);
  return ticket.id;
}

async function ready(kind: MediaKind = "PHOTO") {
  const id = await uploaded(kind);
  await processMedia(id);
  return id;
}

function get(id: string, width: string | number, accept?: string) {
  return GET(
    new Request(`${ORIGIN}/media/${id}/${width}`, {
      headers: accept ? { accept } : {},
    }),
    { params: Promise.resolve({ id, width: String(width) }) },
  );
}

const CHROME =
  "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";
const OLD_SAFARI = "image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5";

describe("GET /media/{id}/{width}", () => {
  it("serves a processed photo to anyone, cached for good", async () => {
    const id = await ready();

    const response = await get(id, 640, OLD_SAFARI);

    expect(response.status).toBe(200);
    expect(Object.fromEntries(response.headers)).toMatchObject({
      "content-type": "image/webp",
      "cache-control": "public, max-age=31536000, immutable",
      vary: "Accept",
      "x-content-type-options": "nosniff",
    });
    const body = Buffer.from(await response.arrayBuffer());
    expect(response.headers.get("content-length")).toBe(String(body.length));
    expect(await sharp(body).metadata()).toMatchObject({
      format: "webp",
      width: 640,
      height: 480,
    });
    expect(await hasExif(body)).toBe(false);
    // A photo is public without anyone's session being looked at.
    expect(mocks.getStaffUser).not.toHaveBeenCalled();
  });

  it("serves AVIF to a browser that accepts it", async () => {
    const id = await ready();

    const avif = await get(id, 320, CHROME);
    const fallback = await get(id, 320);

    expect(avif.headers.get("content-type")).toBe("image/avif");
    expect(
      await sharp(Buffer.from(await avif.arrayBuffer())).metadata(),
    ).toMatchObject({ format: "heif", compression: "av1", width: 320 });
    expect(fallback.headers.get("content-type")).toBe("image/webp");
  });

  it("serves the URL the image loader builds", async () => {
    const id = await ready();
    const path = mediaUrl(id, 700);

    expect(path).toBe(`/media/${id}/1024`);
    expect((await get(id, path.split("/").at(-1)!)).status).toBe(200);
  });

  it("has no URL for the original or for anything but the four widths", async () => {
    const id = await ready();

    for (const width of [
      "original",
      "0",
      "641",
      "640.webp",
      "3200",
      "..",
      "-640",
      "640 ",
    ]) {
      const response = await get(id, width);
      expect(response.status, width).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("serves nothing until the worker is done", async () => {
    const id = await uploaded();

    expect((await get(id, 640)).status).toBe(404);
    expect((await get("no-such-media", 640)).status).toBe(404);

    await processMedia(id);
    expect((await get(id, 640)).status).toBe(200);
  });

  it("serves nothing for a file that failed", async () => {
    const id = await ready();
    await getDb().media.update({
      where: { id },
      data: { status: "FAILED", failure: "stuck" },
    });

    expect((await get(id, 640)).status).toBe(404);
  });
});

describe("the bucket", () => {
  it("gives nothing to anyone without a signature", async () => {
    const id = await ready();
    const { storageKey } = (await mediaRow(id))!;

    for (const key of [storageKey, ...variantKeys(id)]) {
      expect((await anonymousGet(key)).status, key).toBe(403);
    }
  });
});

describe.each(["RECEIPT", "INVOICE", "DOCUMENT"] as const)("a %s", (kind) => {
  it("is not public until it is marked redacted", async () => {
    const id = await ready(kind);

    expect((await get(id, 640)).status).toBe(404);

    expect(await setMediaRedacted(getDb(), id, true)).toEqual({
      before: false,
    });
    const published = await get(id, 640);
    expect(published.status).toBe(200);
    // Not for shared caches, and not for long: it may be unpublished.
    expect(published.headers.get("cache-control")).toBe("private, max-age=300");

    expect(await setMediaRedacted(getDb(), id, false)).toEqual({
      before: true,
    });
    expect((await get(id, 640)).status).toBe(404);
  });
});

describe("a document not yet redacted", () => {
  it("is shown to staff who upload, and never cached", async () => {
    const id = await ready("RECEIPT");
    mocks.getStaffUser.mockResolvedValue(editor);

    const response = await get(id, 1024, CHROME);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Accept, Cookie");
    expect(await hasExif(Buffer.from(await response.arrayBuffer()))).toBe(
      false,
    );
  });

  it("is hidden from staff whose role doesn't upload", async () => {
    const id = await ready("RECEIPT");
    mocks.getStaffUser.mockResolvedValue(await createStaff("COORDINATOR"));

    expect((await get(id, 640)).status).toBe(404);
  });
});

describe("setMediaRedacted", () => {
  it("has nothing to mark on a photo", async () => {
    const id = await ready("PHOTO");

    expect(await setMediaRedacted(getDb(), id, true)).toBeNull();

    expect(await mediaRow(id)).toMatchObject({ redacted: false });
  });

  it("reports no change when the mark is already there", async () => {
    const id = await ready("RECEIPT");
    await setMediaRedacted(getDb(), id, true);

    expect(await setMediaRedacted(getDb(), id, true)).toBeNull();
    expect(await mediaRow(id)).toMatchObject({ redacted: true });
  });

  it("refuses an unknown media", async () => {
    await expect(
      setMediaRedacted(getDb(), "no-such-media", true),
    ).rejects.toBeInstanceOf(MediaError);
  });
});
