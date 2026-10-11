import {
  isUploadMimeType,
  MAX_UPLOAD_BYTES,
  type UploadMimeType,
} from "@/lib/media/constraints";
import {
  EMPTY_FILE_MESSAGE,
  HEIC_MESSAGE,
  UPLOAD_ERROR_MESSAGES,
} from "@/lib/media/messages";
import {
  SNIFF_BYTES,
  sniffImageType,
  type SniffedType,
} from "@/lib/media/sniff";
import type { HeicResult } from "./heic.worker";

// Before a file is uploaded: what it really is, whether it fits, and HEIC
// turned into JPEG — the server takes JPEG, PNG and WebP (sharp has no HEVC
// decoder).

/** A file ready to upload. */
export type PreparedFile = { blob: Blob; mime: UploadMimeType };

/** The file can't be uploaded; the message tells the user why and what to do. */
export class UnusableFileError extends Error {
  override name = "UnusableFileError";
}

// Highest first: a 48 MP photo may need a lower one to fit the size limit.
const JPEG_QUALITIES = [0.9, 0.8, 0.7];

/**
 * What a picked file is, read from its first bytes: the browser's guess is
 * often empty for HEIC. Throws if it is empty, too large or not a photo.
 */
export async function inspectFile(file: File): Promise<SniffedType> {
  if (file.size === 0) throw new UnusableFileError(EMPTY_FILE_MESSAGE);
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UnusableFileError(UPLOAD_ERROR_MESSAGES["too-large"]);
  }
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  const type = sniffImageType(head);
  if (type === null) {
    throw new UnusableFileError(UPLOAD_ERROR_MESSAGES["unsupported-type"]);
  }
  return type;
}

/** Whether the browser can show the file as it is; HEIC it mostly can't. */
export function isUploadable(type: SniffedType): type is UploadMimeType {
  return isUploadMimeType(type);
}

/** The file as the server takes it: HEIC becomes a JPEG, the rest goes as is. */
export async function prepareFile(
  file: File,
  type: SniffedType,
  signal?: AbortSignal,
): Promise<PreparedFile> {
  if (isUploadable(type)) return { blob: file, mime: type };

  const blob = await heicToJpeg(file, signal).catch((error: unknown) => {
    if (error instanceof UnusableFileError || isAbort(error)) throw error;
    throw new UnusableFileError(HEIC_MESSAGE);
  });
  return { blob, mime: "image/jpeg" };
}

async function heicToJpeg(file: File, signal?: AbortSignal): Promise<Blob> {
  const decoded = await decodeHeic(await file.arrayBuffer(), signal);
  const canvas = document.createElement("canvas");
  canvas.width = decoded.width;
  canvas.height = decoded.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no 2d canvas");
  context.putImageData(
    new ImageData(
      new Uint8ClampedArray(decoded.pixels),
      decoded.width,
      decoded.height,
    ),
    0,
    0,
  );

  for (const quality of JPEG_QUALITIES) {
    signal?.throwIfAborted();
    const jpeg = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });
    if (!jpeg) throw new Error("the canvas could not be encoded");
    if (jpeg.size <= MAX_UPLOAD_BYTES) return jpeg;
  }
  throw new UnusableFileError(UPLOAD_ERROR_MESSAGES["too-large"]);
}

type DecodedHeic = Extract<HeicResult, { ok: true }>;

/** Runs ./heic.worker.ts for one file; the worker (and its memory) goes after. */
function decodeHeic(
  file: ArrayBuffer,
  signal?: AbortSignal,
): Promise<DecodedHeic> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./heic.worker.ts", import.meta.url), {
      type: "module",
    });
    const finish = (settle: () => void) => {
      worker.terminate();
      signal?.removeEventListener("abort", onAbort);
      settle();
    };
    const onAbort = () => finish(() => reject(signal?.reason as Error));

    worker.onmessage = ({ data }: MessageEvent<HeicResult>) => {
      finish(() => {
        if (data.ok) resolve(data);
        else reject(new Error("the file could not be decoded"));
      });
    };
    worker.onerror = () => {
      finish(() => reject(new Error("the decoder could not start")));
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort);
    worker.postMessage(file, [file]);
  });
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
