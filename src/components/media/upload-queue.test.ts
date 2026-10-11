import { describe, expect, it, vi } from "vitest";
import { UPLOAD_NETWORK_MESSAGE } from "@/lib/media/messages";
import type { MediaState } from "@/lib/media/types";
import { UnusableFileError, type PreparedFile } from "./prepare-file";
import { UploadError } from "./upload-client";
import { UploadQueue, type UploadSteps } from "./upload-queue";

type Progress = (share: number) => void;

/** An upload the test finishes by hand. */
type Pending = {
  name: string;
  signal: AbortSignal;
  onProgress: Progress;
  finish: (id?: string) => void;
  fail: (error: unknown) => void;
};

const file = (name: string, type = "image/jpeg") =>
  new File(["photo"], name, { type });

const media = (id: string): MediaState => ({
  id,
  kind: "PHOTO",
  status: "UPLOADED",
  width: null,
  height: null,
  blur: null,
  redacted: false,
  failure: null,
});

function setup(overrides: Partial<UploadSteps> = {}) {
  const pending: Pending[] = [];
  const uploaded: { id: string; previewUrl: string | null }[] = [];
  const names = new Map<Blob, string>();

  const steps: UploadSteps = {
    inspect: (picked) => {
      if (picked.name.endsWith(".gif")) {
        return Promise.reject(
          new UnusableFileError("Этот формат не подходит."),
        );
      }
      return Promise.resolve(
        picked.name.endsWith(".heic") ? "image/heic" : "image/jpeg",
      );
    },
    prepare: (picked, type) => {
      const prepared: PreparedFile =
        type === "image/heic"
          ? { blob: new Blob(["converted"]), mime: "image/jpeg" }
          : { blob: picked, mime: "image/jpeg" };
      names.set(prepared.blob, picked.name);
      return Promise.resolve(prepared);
    },
    upload: (_kind, prepared, { onProgress, signal }) =>
      new Promise<MediaState>((resolve, reject) => {
        const name = names.get(prepared.blob)!;
        signal.addEventListener("abort", () =>
          reject(new DOMException("cancelled", "AbortError")),
        );
        pending.push({
          name,
          signal,
          onProgress,
          finish: (id = name) => resolve(media(id)),
          fail: reject,
        });
      }),
    ...overrides,
  };
  const queue = new UploadQueue(steps);
  queue.onUploaded(({ id }, previewUrl) => uploaded.push({ id, previewUrl }));
  const phases = () =>
    queue.getSnapshot().map(({ name, phase }) => `${name}: ${phase}`);
  /** Lets the queue's promise chains run up to the next upload. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { queue, pending, uploaded, phases, settle };
}

describe("UploadQueue", () => {
  it("uploads one file at a time, in the order they were picked", async () => {
    const { queue, pending, uploaded, phases, settle } = setup();

    await queue.add("PHOTO", [file("a.jpg"), file("b.jpg"), file("c.jpg")]);
    await settle();

    expect(phases()).toEqual([
      "a.jpg: uploading",
      "b.jpg: queued",
      "c.jpg: queued",
    ]);
    expect(pending.map(({ name }) => name)).toEqual(["a.jpg"]);

    pending[0]!.finish();
    await settle();
    expect(phases()).toEqual(["b.jpg: uploading", "c.jpg: queued"]);

    pending[1]!.finish();
    await settle();
    pending[2]!.finish();
    await settle();

    expect(phases()).toEqual([]);
    expect(uploaded.map(({ id }) => id)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
  });

  it("turns away files that can't be uploaded, with the reason", async () => {
    const { queue, phases, settle } = setup();

    const rejected = await queue.add("PHOTO", [
      file("anim.gif"),
      file("a.jpg"),
    ]);
    await settle();

    expect(rejected).toEqual([
      { name: "anim.gif", reason: "Этот формат не подходит." },
    ]);
    expect(phases()).toEqual(["a.jpg: uploading"]);
  });

  it("shows a preview at once, and for HEIC once it is converted", async () => {
    const { queue, pending, uploaded, settle } = setup({});

    await queue.add("PHOTO", [file("a.jpg"), file("b.heic", "")]);
    const [jpeg, heic] = queue.getSnapshot();
    expect(jpeg!.previewUrl).toMatch(/^blob:/);
    expect(heic!.previewUrl).toBeNull();

    await settle();
    pending[0]!.finish();
    await settle();

    expect(queue.getSnapshot()[0]).toMatchObject({
      name: "b.heic",
      phase: "uploading",
      previewUrl: expect.stringMatching(/^blob:/) as string,
    });
    // The preview goes to the form together with the uploaded file.
    expect(uploaded).toEqual([{ id: "a.jpg", previewUrl: jpeg!.previewUrl }]);
  });

  it("reports progress, then the wait for the server", async () => {
    const { queue, pending, settle } = setup();
    await queue.add("PHOTO", [file("a.jpg")]);
    await settle();

    pending[0]!.onProgress(0.4);
    expect(queue.getSnapshot()[0]).toMatchObject({
      phase: "uploading",
      progress: 0.4,
    });

    pending[0]!.onProgress(1);
    expect(queue.getSnapshot()[0]).toMatchObject({ phase: "finishing" });
  });

  it("keeps a failed upload for a retry and goes on with the next", async () => {
    const { queue, pending, uploaded, phases, settle } = setup();
    await queue.add("PHOTO", [file("a.jpg"), file("b.jpg")]);
    await settle();

    pending[0]!.fail(new UploadError("Нет связи.", null));
    await settle();

    expect(queue.getSnapshot()[0]).toMatchObject({
      name: "a.jpg",
      phase: "failed",
      error: "Нет связи.",
      retryable: true,
    });
    expect(phases()).toEqual(["a.jpg: failed", "b.jpg: uploading"]);

    queue.retry(queue.getSnapshot()[0]!.key);
    expect(phases()).toEqual(["a.jpg: queued", "b.jpg: uploading"]);
    pending[1]!.finish();
    await settle();
    pending[2]!.finish();
    await settle();

    expect(uploaded.map(({ id }) => id)).toEqual(["b.jpg", "a.jpg"]);
  });

  it("tells a refusal that a retry won't change from a network failure", async () => {
    const { queue, pending, settle } = setup();
    await queue.add("PHOTO", [file("a.jpg"), file("b.jpg"), file("c.jpg")]);
    await settle();

    pending[0]!.fail(new UploadError("Файл больше 15 МБ.", "too-large"));
    await settle();
    pending[1]!.fail(new Error("something unexpected"));
    await settle();

    expect(queue.getSnapshot().slice(0, 2)).toMatchObject([
      { error: "Файл больше 15 МБ.", retryable: false },
      { error: UPLOAD_NETWORK_MESSAGE, retryable: true },
    ]);
  });

  it("fails a HEIC that can't be read without stopping the queue", async () => {
    const { queue, phases, settle } = setup({
      prepare: (picked, type) =>
        type === "image/heic"
          ? Promise.reject(new UnusableFileError("Не получилось прочитать."))
          : Promise.resolve({ blob: picked, mime: "image/jpeg" }),
      upload: () => new Promise(() => undefined),
    });

    await queue.add("PHOTO", [file("broken.heic", ""), file("a.jpg")]);
    await settle();

    expect(queue.getSnapshot()[0]).toMatchObject({
      phase: "failed",
      error: "Не получилось прочитать.",
      retryable: false,
    });
    expect(phases()).toEqual(["broken.heic: failed", "a.jpg: uploading"]);
  });

  it("cancels a running upload when it is removed", async () => {
    const { queue, pending, uploaded, phases, settle } = setup();
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    await queue.add("PHOTO", [file("a.jpg"), file("b.jpg")]);
    await settle();
    const [first] = queue.getSnapshot();

    queue.remove(first!.key);
    await settle();

    expect(pending[0]!.signal.aborted).toBe(true);
    expect(revoke).toHaveBeenCalledWith(first!.previewUrl);
    expect(phases()).toEqual(["b.jpg: uploading"]);

    // Its answer, should it still come, changes nothing.
    pending[0]!.finish();
    pending[1]!.finish();
    await settle();
    expect(uploaded.map(({ id }) => id)).toEqual(["b.jpg"]);
    revoke.mockRestore();
  });

  it("removes a file that is still waiting", async () => {
    const { queue, pending, phases, settle } = setup();
    await queue.add("PHOTO", [file("a.jpg"), file("b.jpg")]);
    await settle();

    queue.remove(queue.getSnapshot()[1]!.key);
    pending[0]!.finish();
    await settle();

    expect(phases()).toEqual([]);
    expect(pending).toHaveLength(1);
  });

  it("tells its subscribers about every change", async () => {
    const { queue, settle } = setup();
    const listener = vi.fn();
    const unsubscribe = queue.subscribe(listener);
    const before = queue.getSnapshot();

    await queue.add("PHOTO", [file("a.jpg")]);
    await settle();

    expect(listener).toHaveBeenCalled();
    expect(queue.getSnapshot()).not.toBe(before);

    unsubscribe();
    listener.mockClear();
    queue.dispose();
    expect(listener).not.toHaveBeenCalled();
    expect(queue.getSnapshot()).toEqual([]);
  });
});
