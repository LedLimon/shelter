import type { MediaKind } from "@/generated/prisma/enums";
import {
  UPLOAD_ERROR_MESSAGES,
  UPLOAD_NETWORK_MESSAGE,
} from "@/lib/media/messages";
import type {
  MediaState,
  UploadErrorBody,
  UploadErrorCode,
  UploadTicket,
} from "@/lib/media/types";
import type { PreparedFile } from "./prepare-file";

// The browser's side of an upload (docs/architecture.md#медиа):
// presign → PUT straight to the storage → complete; then status until the
// worker is done.

/** An upload step failed; the message is for the user. */
export class UploadError extends Error {
  override name = "UploadError";

  constructor(
    message: string,
    /** Null when the server never answered. */
    readonly code: UploadErrorCode | null,
  ) {
    super(message);
  }

  /** Whether doing the same again may work: the network, not the file. */
  get retryable(): boolean {
    return (
      this.code === null ||
      this.code === "unauthorized" ||
      this.code === "quota" ||
      this.code === "not-uploaded"
    );
  }
}

async function call<Result>(path: string, init: RequestInit): Promise<Result> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, credentials: "same-origin" });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new UploadError(UPLOAD_NETWORK_MESSAGE, null);
  }
  if (response.ok) return (await response.json()) as Result;

  const body = (await response
    .json()
    .catch(() => null)) as Partial<UploadErrorBody> | null;
  const code = body?.error?.code;
  if (code && code in UPLOAD_ERROR_MESSAGES) {
    throw new UploadError(
      body.error?.message ?? UPLOAD_ERROR_MESSAGES[code],
      code,
    );
  }
  throw new UploadError(UPLOAD_NETWORK_MESSAGE, null);
}

const post = <Result>(path: string, body: unknown, signal?: AbortSignal) =>
  call<Result>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

/**
 * Uploads a prepared file and hands it to the worker. `onProgress` gets the
 * share of bytes sent, 0…1. Rejects with an UploadError, or with the
 * signal's AbortError.
 */
export async function uploadFile(
  kind: MediaKind,
  { blob, mime }: PreparedFile,
  options: { onProgress: (share: number) => void; signal: AbortSignal },
): Promise<MediaState> {
  const ticket = await post<UploadTicket>(
    "/api/upload/presign",
    { kind, mime, byteSize: blob.size },
    options.signal,
  );
  try {
    await put(ticket, blob, options);
    return await post<MediaState>(
      "/api/upload/complete",
      { id: ticket.id },
      options.signal,
    );
  } catch (error) {
    // Cancelled or failed halfway: the row is of no use to anyone.
    discardUpload(ticket.id);
    throw error;
  }
}

function put(
  ticket: UploadTicket,
  blob: Blob,
  {
    onProgress,
    signal,
  }: { onProgress: (share: number) => void; signal: AbortSignal },
): Promise<void> {
  // XMLHttpRequest, not fetch(): only it reports upload progress everywhere.
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const onAbort = () => request.abort();
    const settle = (run: () => void) => {
      signal.removeEventListener("abort", onAbort);
      run();
    };
    const failed = () =>
      settle(() => reject(new UploadError(UPLOAD_NETWORK_MESSAGE, null)));

    request.open("PUT", ticket.url);
    for (const [name, value] of Object.entries(ticket.headers)) {
      request.setRequestHeader(name, value);
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) settle(resolve);
      else failed();
    };
    request.onerror = failed;
    request.ontimeout = failed;
    request.onabort = () =>
      settle(() => reject(new DOMException("Upload cancelled", "AbortError")));
    signal.addEventListener("abort", onAbort);
    if (signal.aborted) return onAbort();
    request.send(blob);
  });
}

/**
 * Tells the server a file uploaded here is not wanted after all. Best
 * effort: whatever stays behind, the nightly cleanup or a later save takes.
 */
export function discardUpload(id: string): void {
  void fetch("/api/upload/discard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
    credentials: "same-origin",
    // Still sent if the page is being left.
    keepalive: true,
  }).catch(() => undefined);
}

/** Where the worker is with these files; ids it doesn't know are left out. */
export async function fetchMediaStates(
  ids: readonly string[],
  signal?: AbortSignal,
): Promise<MediaState[]> {
  const query = ids.map((id) => `id=${encodeURIComponent(id)}`).join("&");
  const { items } = await call<{ items: MediaState[] }>(
    `/api/upload/status?${query}`,
    { signal },
  );
  return items;
}
