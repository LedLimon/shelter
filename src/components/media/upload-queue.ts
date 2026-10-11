import type { MediaKind } from "@/generated/prisma/enums";
import { UPLOAD_NETWORK_MESSAGE } from "@/lib/media/messages";
import type { SniffedType } from "@/lib/media/sniff";
import type { MediaState } from "@/lib/media/types";
import {
  inspectFile,
  isUploadable,
  prepareFile,
  UnusableFileError,
  type PreparedFile,
} from "./prepare-file";
import { UploadError, uploadFile } from "./upload-client";

/** A picked file on its way to the storage. */
export type QueuedUpload = {
  /** Local: the file has no Media id until it is uploaded. */
  key: string;
  name: string;
  phase: "queued" | "preparing" | "uploading" | "finishing" | "failed";
  /** Share of bytes sent, 0…1, while uploading. */
  progress: number;
  /** Object URL of what the browser can show; null for HEIC not converted yet. */
  previewUrl: string | null;
  /** Why it failed, for the user. */
  error: string | null;
  /** Whether trying again may help: the network failed, not the file. */
  retryable: boolean;
};

/** A picked file that can't be uploaded, and why. */
export type RejectedFile = { name: string; reason: string };

/**
 * The file is in the storage and queued for processing. `previewUrl` now
 * belongs to the listener, to revoke when it is no longer shown; `key` is
 * the upload it was on the list.
 */
export type UploadedListener = (
  media: MediaState,
  previewUrl: string | null,
  key: string,
) => void;

/** The steps of an upload; tests replace them. */
export type UploadSteps = {
  inspect: (file: File) => Promise<SniffedType>;
  prepare: (
    file: File,
    type: SniffedType,
    signal: AbortSignal,
  ) => Promise<PreparedFile>;
  upload: (
    kind: MediaKind,
    prepared: PreparedFile,
    options: { onProgress: (share: number) => void; signal: AbortSignal },
  ) => Promise<MediaState>;
};

const BROWSER_STEPS: UploadSteps = {
  inspect: inspectFile,
  prepare: prepareFile,
  upload: uploadFile,
};

/**
 * Uploads picked files one after another, in the order they were picked: a
 * phone's uplink gains nothing from parallel uploads, and the files land in
 * the form in the order the user chose them.
 *
 * A store for useSyncExternalStore (./media-uploader.tsx): `subscribe` and
 * `getSnapshot`; every change makes a new array.
 */
export class UploadQueue {
  private uploads: readonly QueuedUpload[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly files = new Map<
    string,
    { file: File; type: SniffedType; kind: MediaKind }
  >();
  private readonly previews = new Set<string>();
  private readonly uploadedListeners = new Set<UploadedListener>();
  private running: { key: string; controller: AbortController } | null = null;
  private counter = 0;
  /** Grows with every dispose(): what was picked before it is not started. */
  private generation = 0;

  constructor(private readonly steps: UploadSteps = BROWSER_STEPS) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): readonly QueuedUpload[] => this.uploads;

  /** Calls `listener` for every file that made it; returns the way to stop. */
  onUploaded(listener: UploadedListener): () => void {
    this.uploadedListeners.add(listener);
    return () => this.uploadedListeners.delete(listener);
  }

  /**
   * Queues the files that can be uploaded and returns the ones that can't,
   * with reasons. Each file is checked by its first bytes right away, not
   * when its turn comes.
   */
  async add(kind: MediaKind, picked: readonly File[]): Promise<RejectedFile[]> {
    const { generation } = this;
    const inspected = await Promise.all(
      picked.map((file) =>
        this.steps.inspect(file).catch((error: unknown) => messageOf(error)),
      ),
    );
    // The uploader left the page while the files were being looked at.
    if (generation !== this.generation) return [];
    const rejected: RejectedFile[] = [];
    const accepted: QueuedUpload[] = [];
    picked.forEach((file, index) => {
      const type = inspected[index]!;
      if (typeof type === "object") {
        rejected.push({ name: file.name, reason: type.message });
        return;
      }
      this.counter += 1;
      const key = `upload-${this.counter}`;
      this.files.set(key, { file, type, kind });
      accepted.push({
        key,
        name: file.name,
        phase: "queued",
        progress: 0,
        previewUrl: isUploadable(type) ? this.preview(file) : null,
        error: null,
        retryable: false,
      });
    });
    if (accepted.length > 0) {
      this.set([...this.uploads, ...accepted]);
      this.pump();
    }
    return rejected;
  }

  /** Puts a failed upload back in the queue. */
  retry(key: string): void {
    this.patch(key, { phase: "queued", error: null, progress: 0 });
    this.pump();
  }

  /** Cancels the upload if it is running and takes the file off the list. */
  remove(key: string): void {
    if (this.running?.key === key) this.running.controller.abort();
    this.release(this.find(key)?.previewUrl ?? null);
    this.drop(key);
  }

  /** Cancels everything: the uploader is leaving the page. */
  dispose(): void {
    this.generation += 1;
    this.running?.controller.abort();
    for (const url of this.previews) URL.revokeObjectURL(url);
    this.previews.clear();
    this.files.clear();
    this.set([]);
  }

  /** Starts the next queued file, unless one is on its way. */
  private pump(): void {
    if (this.running) return;
    const next = this.uploads.find(({ phase }) => phase === "queued");
    if (next) void this.run(next);
  }

  private async run(upload: QueuedUpload): Promise<void> {
    const entry = this.files.get(upload.key);
    if (!entry) return;
    const { key } = upload;
    const controller = new AbortController();
    this.running = { key, controller };
    let previewUrl = upload.previewUrl;

    try {
      this.patch(key, { phase: "preparing" });
      const prepared = await this.steps.prepare(
        entry.file,
        entry.type,
        controller.signal,
      );
      // A converted HEIC can be shown at last.
      previewUrl ??= this.preview(prepared.blob);
      this.patch(key, { phase: "uploading", progress: 0, previewUrl });

      const media = await this.steps.upload(entry.kind, prepared, {
        signal: controller.signal,
        onProgress: (progress) =>
          this.patch(key, progress < 1 ? { progress } : { phase: "finishing" }),
      });
      controller.signal.throwIfAborted();

      // The preview is the listener's from here on.
      if (previewUrl) this.previews.delete(previewUrl);
      this.drop(key);
      for (const listener of this.uploadedListeners) {
        listener(media, previewUrl, key);
      }
    } catch (error) {
      // Cancelled by remove() or dispose(), which dropped the upload already.
      if (!controller.signal.aborted) {
        const failure = messageOf(error);
        this.patch(key, {
          phase: "failed",
          previewUrl,
          error: failure.message,
          retryable: failure.retryable,
        });
      }
    } finally {
      if (this.running?.controller === controller) this.running = null;
      this.pump();
    }
  }

  private find(key: string): QueuedUpload | undefined {
    return this.uploads.find((upload) => upload.key === key);
  }

  private patch(key: string, changes: Partial<QueuedUpload>): void {
    if (!this.find(key)) return;
    this.set(
      this.uploads.map((upload) =>
        upload.key === key ? { ...upload, ...changes } : upload,
      ),
    );
  }

  private drop(key: string): void {
    this.files.delete(key);
    if (this.find(key)) {
      this.set(this.uploads.filter((upload) => upload.key !== key));
    }
  }

  private set(uploads: readonly QueuedUpload[]): void {
    this.uploads = uploads;
    for (const listener of this.listeners) listener();
  }

  private preview(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this.previews.add(url);
    return url;
  }

  private release(url: string | null): void {
    if (!url) return;
    this.previews.delete(url);
    URL.revokeObjectURL(url);
  }
}

/** What to tell the user about a failed step, and whether a retry may help. */
function messageOf(error: unknown): { message: string; retryable: boolean } {
  if (error instanceof UnusableFileError) {
    return { message: error.message, retryable: false };
  }
  if (error instanceof UploadError) {
    return { message: error.message, retryable: error.retryable };
  }
  return { message: UPLOAD_NETWORK_MESSAGE, retryable: true };
}
