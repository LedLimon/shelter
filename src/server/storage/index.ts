import "server-only";
import { getEnv } from "@/lib/env";
import { createStorage, type Storage } from "./s3";

export { StorageError } from "./s3";
export type { PresignedUpload, Storage, StoredObject } from "./s3";

let storage: Storage | undefined;

/**
 * The bucket of this process (S3_* variables): private, so nothing in it is
 * readable without a signed request. Created on first use, like getDb().
 */
export function getStorage(): Storage {
  if (!storage) {
    const env = getEnv();
    storage = createStorage({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
  }
  return storage;
}
