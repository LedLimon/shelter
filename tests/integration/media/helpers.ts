// Shared by the media tests. A file's tests share one database and one bucket
// (createBucket() in beforeAll): they tell their media apart by id.
import { AwsClient } from "aws4fetch";
import sharp from "sharp";
import type { UserRole } from "@/generated/prisma/enums";
import { getEnv } from "@/lib/env";
import type { MediaState, UploadTicket } from "@/lib/media/types";
import type { StaffUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import type { JobContext } from "@/server/jobs/boss";
import type { JobName } from "@/server/jobs/definitions";
import { jobHandlers } from "@/server/jobs/handlers";
import { drainOutbox } from "@/server/jobs/outbox/dispatcher";
import { variantKeys } from "@/server/media/keys";
import { getStorage } from "@/server/storage";
import { objectUrl } from "@/server/storage/s3";
import { handlersWith, testLogger } from "../jobs/helpers";

/** APP_URL of .env.example, which the test setup loads. */
export const ORIGIN = "http://localhost:3000";

function storageConfig() {
  const env = getEnv();
  return {
    endpoint: env.S3_ENDPOINT,
    bucket: env.S3_BUCKET,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  };
}

/** Creates this file's bucket in the run's MinIO: private, like production's. */
export async function createBucket(): Promise<void> {
  const env = getEnv();
  const client = new AwsClient({
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    region: env.S3_REGION,
    service: "s3",
  });
  const response = await client.fetch(objectUrl(storageConfig(), ""), {
    method: "PUT",
  });
  if (!response.ok) {
    throw new Error(`Couldn't create the test bucket: HTTP ${response.status}`);
  }
}

/** An object as anyone on the internet would ask for it: no signature. */
export function anonymousGet(key: string): Promise<Response> {
  return fetch(objectUrl(storageConfig(), key));
}

let userCounter = 0;

/** A staff member in the database, as getStaffUser() would return them. */
export async function createStaff(
  role: UserRole = "EDITOR",
): Promise<StaffUser> {
  userCounter += 1;
  const user = await getDb().user.create({
    data: {
      email: `media-${role.toLowerCase()}-${userCounter}@shelter.localhost`,
      name: "Сотрудник",
      role,
      emailVerified: true,
    },
  });
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

/** What a phone writes into a photo: camera, time and where it was taken. */
export const PHONE_EXIF = {
  IFD0: { Make: "ShelterPhone", Model: "Curator 15" },
  IFD2: { DateTimeOriginal: "2026:10:11 12:30:00" },
  IFD3: {
    GPSLatitudeRef: "N",
    GPSLatitude: "55/1 45/1 2100/100",
    GPSLongitudeRef: "E",
    GPSLongitude: "37/1 37/1 300/100",
  },
};

/** A JPEG as a phone makes it: with EXIF, GPS coordinates included. */
export function phonePhoto(width = 1200, height = 900): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 150, g: 110, b: 70 },
    },
  })
    .jpeg()
    .withExif(PHONE_EXIF)
    .toBuffer();
}

/** Whether an image carries EXIF at all, GPS or not. */
export async function hasExif(image: Uint8Array): Promise<boolean> {
  return (await sharp(image).metadata()).exif !== undefined;
}

export function jsonRequest(
  path: string,
  body: unknown,
  { origin = ORIGIN }: { origin?: string } = {},
): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** PUTs a file to an upload URL the way the browser does. */
export function putFile(
  ticket: Pick<UploadTicket, "url" | "headers">,
  bytes: Uint8Array,
  headers: Record<string, string> = ticket.headers,
): Promise<Response> {
  return fetch(ticket.url, {
    method: "PUT",
    headers,
    body: bytes as Uint8Array<ArrayBuffer>,
  });
}

/** Bytes of a stored object, or null if there is none. */
export async function stored(key: string): Promise<Buffer | null> {
  const object = await getStorage().get(key);
  if (!object) return null;
  return Buffer.from(await new Response(object.body).arrayBuffer());
}

/** Which of a media's processed versions are in the bucket. */
export async function storedVariants(mediaId: string): Promise<string[]> {
  const sizes = await Promise.all(
    variantKeys(mediaId).map(async (key) => ({
      key,
      size: await getStorage().size(key),
    })),
  );
  return sizes.filter(({ size }) => size !== null).map(({ key }) => key);
}

/**
 * Runs everything the worker would: outbox events, and the jobs they start —
 * in this process, in place of pg-boss. Returns the number of events run.
 */
export function runWorker(): Promise<number> {
  const context: JobContext = {
    jobId: "test",
    attempt: 1,
    signal: new AbortController().signal,
  };
  return drainOutbox(getDb(), {
    logger: testLogger(),
    handlers: handlersWith({
      "job.run": async ({ name, payload }) => {
        await jobHandlers[name as JobName](payload as never, context);
      },
    }),
  });
}

export function mediaRow(id: string) {
  return getDb().media.findUnique({ where: { id } });
}

export type { MediaState, UploadTicket };
