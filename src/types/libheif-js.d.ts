// libheif-js ships types only for its Node entry; this is the browser bundle
// (the wasm binary inlined), as far as src/components/media/heic.worker.ts
// uses it.
declare module "libheif-js/libheif-wasm/libheif-bundle.mjs" {
  type HeifImage = {
    get_width(): number;
    get_height(): number;
    /** Writes RGBA pixels into `target.data`; calls back with a falsy value on failure. */
    display(
      target: { data: Uint8ClampedArray; width: number; height: number },
      callback: (result: unknown) => void,
    ): void;
    free(): void;
  };

  type Libheif = {
    HeifDecoder: new () => { decode(data: Uint8Array): HeifImage[] };
  };

  export default function libheif(options?: object): Libheif;
}
