// Decodes a HEIC photo off the main thread: libheif (wasm) takes about a
// second for a 12 MP shot, and the page must not freeze meanwhile. Loaded
// only when someone picks a HEIC file (./prepare-file.ts).
import libheif from "libheif-js/libheif-wasm/libheif-bundle.mjs";

export type HeicResult =
  | { ok: true; width: number; height: number; pixels: ArrayBuffer }
  | { ok: false };

// The project compiles against the DOM lib, where `self` is a Window.
type WorkerScope = {
  onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null;
  postMessage(message: HeicResult, transfer?: Transferable[]): void;
};
const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  decode(event.data).then(
    (result) => scope.postMessage(result, [result.pixels]),
    () => scope.postMessage({ ok: false }),
  );
};

/** The file's primary image as RGBA pixels, upright: libheif applies rotation. */
async function decode(file: ArrayBuffer) {
  const decoder = new (libheif().HeifDecoder)();
  const [image] = decoder.decode(new Uint8Array(file));
  if (!image) throw new Error("no image in the file");
  try {
    const width = image.get_width();
    const height = image.get_height();
    const data = new Uint8ClampedArray(width * height * 4);
    await new Promise<void>((resolve, reject) => {
      image.display({ data, width, height }, (result) => {
        if (result) resolve();
        else reject(new Error("the image could not be decoded"));
      });
    });
    return { ok: true as const, width, height, pixels: data.buffer };
  } finally {
    image.free();
  }
}
