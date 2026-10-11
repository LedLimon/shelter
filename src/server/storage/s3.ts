import { AwsClient, AwsV4Signer } from "aws4fetch";

// The S3 API as far as the app needs it: MinIO in dev and tests, Yandex Object
// Storage in production. aws4fetch signs the requests (Signature V4); the
// requests themselves are plain fetch().

export type StorageConfig = {
  /** `http://localhost:9000`, `https://storage.yandexcloud.net`. */
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** `endpoint/bucket/key` (MinIO) instead of `bucket.endpoint/key`. */
  forcePathStyle: boolean;
};

export type StoredObject = {
  body: ReadableStream<Uint8Array>;
  byteSize: number | null;
  contentType: string | null;
  etag: string | null;
};

export type PresignedUpload = {
  url: string;
  /** Headers the upload must send exactly as given: they are signed. */
  headers: Record<string, string>;
};

export type Storage = {
  /**
   * A URL the browser can PUT one object to, valid for `expiresIn` seconds.
   * The content type and the length are part of the signature: the storage
   * refuses a body of another type or size.
   */
  presignUpload(
    key: string,
    options: { contentType: string; byteSize: number; expiresIn: number },
  ): Promise<PresignedUpload>;
  /** Size of the object, or null if there is none. */
  size(key: string, signal?: AbortSignal): Promise<number | null>;
  /** The object, or null if there is none. */
  get(key: string, signal?: AbortSignal): Promise<StoredObject | null>;
  put(
    key: string,
    body: Uint8Array,
    options: { contentType: string; signal?: AbortSignal },
  ): Promise<void>;
  /** Deleting an object that isn't there is not an error. */
  delete(key: string, signal?: AbortSignal): Promise<void>;
};

/** The storage answered with an error. Carries no key and no body. */
export class StorageError extends Error {
  override name = "StorageError";

  constructor(
    readonly operation: string,
    readonly status: number,
  ) {
    super(`storage ${operation} failed with HTTP ${status}`);
  }
}

export function createStorage(config: StorageConfig): Storage {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    service: "s3",
    // On top of the first attempt, for 5xx and 429; a job retries the rest.
    retries: 2,
  });
  const urlOf = (key: string) => objectUrl(config, key);

  async function send(
    operation: string,
    key: string,
    init: RequestInit,
    okStatuses: readonly number[] = [],
  ): Promise<Response> {
    const response = await client.fetch(urlOf(key), init);
    if (!response.ok && !okStatuses.includes(response.status)) {
      // The body may name the bucket and the key: not for logs.
      await response.body?.cancel();
      throw new StorageError(operation, response.status);
    }
    return response;
  }

  return {
    async presignUpload(key, { contentType, byteSize, expiresIn }) {
      const url = new URL(urlOf(key));
      url.searchParams.set("X-Amz-Expires", String(expiresIn));
      const headers = {
        "content-type": contentType,
        "content-length": String(byteSize),
      };
      const signed = await new AwsV4Signer({
        method: "PUT",
        url: url.href,
        headers,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        region: config.region,
        service: "s3",
        signQuery: true,
        // Content-Type and Content-Length are not signed by default.
        allHeaders: true,
      }).sign();
      // The browser sets Content-Length itself, from the body.
      return {
        url: signed.url.href,
        headers: { "Content-Type": contentType },
      };
    },

    async size(key, signal) {
      const response = await send(
        "head",
        key,
        { method: "HEAD", signal },
        [404],
      );
      if (response.status === 404) return null;
      const length = Number(response.headers.get("content-length"));
      return Number.isSafeInteger(length) ? length : null;
    },

    async get(key, signal) {
      const response = await send("get", key, { method: "GET", signal }, [404]);
      if (response.status === 404 || !response.body) {
        await response.body?.cancel();
        return null;
      }
      const length = Number(response.headers.get("content-length"));
      return {
        body: response.body,
        byteSize: Number.isSafeInteger(length) ? length : null,
        contentType: response.headers.get("content-type"),
        etag: response.headers.get("etag"),
      };
    },

    async put(key, body, { contentType, signal }) {
      const response = await send("put", key, {
        method: "PUT",
        // Never a view over shared memory, which is all the type guards against.
        body: body as Uint8Array<ArrayBuffer>,
        headers: { "content-type": contentType },
        signal,
      });
      await response.body?.cancel();
    },

    async delete(key, signal) {
      const response = await send(
        "delete",
        key,
        { method: "DELETE", signal },
        [404],
      );
      await response.body?.cancel();
    },
  };
}

/** URL of an object. Keys are ours (letters, digits, `/`, `.`, `-`). */
export function objectUrl(
  config: Pick<StorageConfig, "endpoint" | "bucket" | "forcePathStyle">,
  key: string,
): string {
  const url = new URL(config.endpoint);
  const base = url.pathname.replace(/\/+$/, "");
  if (config.forcePathStyle) {
    url.pathname = `${base}/${config.bucket}/${key}`;
  } else {
    url.hostname = `${config.bucket}.${url.hostname}`;
    url.pathname = `${base}/${key}`;
  }
  return url.href;
}
