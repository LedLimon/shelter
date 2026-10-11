import sharp from "sharp";
import {
  VARIANT_WIDTHS,
  type VariantFormat,
  type VariantWidth,
} from "@/lib/media/constraints";
import type { MediaFailure } from "@/lib/media/types";

// Turns an uploaded original into what pages show. Only the worker imports
// this module: sharp is a native library and has no place in the web process.

/** What an upload may really be, whatever content type it claimed. */
const INPUT_FORMATS: ReadonlySet<string> = new Set(["jpeg", "png", "webp"]);

/**
 * A 50 MP phone photo fits with room to spare; a small file that unpacks
 * into gigabytes of pixels does not.
 */
export const MAX_INPUT_PIXELS = 100_000_000;

/**
 * The longest side WebP can hold (AVIF allows a little more). A long
 * screenshot of a receipt is taller: its versions are fitted into this,
 * which narrows them by a few pixels at most.
 */
const MAX_SIDE = 16_383;

const BLUR_SIZE = 16;

export type Variant = {
  width: VariantWidth;
  format: VariantFormat;
  data: Buffer;
};

export type ProcessedImage = {
  /** Of the upright original: EXIF rotation applied. */
  width: number;
  height: number;
  /** A few hundred bytes: a WebP within 16×16 px, as a data URL. */
  blur: string;
  /** Every width in every format. */
  variants: Variant[];
};

/** The file can't become an image, now or on a retry. */
export class UnprocessableImageError extends Error {
  override name = "UnprocessableImageError";

  constructor(readonly failure: MediaFailure) {
    super(`unprocessable image: ${failure}`);
  }
}

/**
 * Decodes the original, turns it upright and encodes the versions pages use:
 * WebP and AVIF at every width of VARIANT_WIDTHS, never enlarged, plus a
 * blurred placeholder. sharp writes no metadata unless asked to, so the
 * results carry no EXIF (camera, time, GPS), XMP or IPTC, and colours are
 * converted to sRGB (iPhone photos come in Display P3).
 */
export async function processImage(
  original: Uint8Array,
  { maxInputPixels = MAX_INPUT_PIXELS } = {},
): Promise<ProcessedImage> {
  const base = await decode(original, maxInputPixels);
  // Raw pixels of the widest version: the original is decoded once, the
  // smaller versions are scaled from this.
  const source = () =>
    sharp(base.data, {
      raw: {
        width: base.info.width,
        height: base.info.height,
        channels: base.info.channels,
      },
    });

  const variants: Variant[] = [];
  // One at a time: each encode already uses every core.
  for (const width of VARIANT_WIDTHS) {
    const resized = source().resize({
      width,
      height: MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    });
    variants.push({
      width,
      format: "webp",
      data: await resized.clone().webp({ quality: 80 }).toBuffer(),
    });
    variants.push({
      width,
      format: "avif",
      data: await resized
        .clone()
        .avif({ quality: 55, effort: 4, chromaSubsampling: "4:2:0" })
        .toBuffer(),
    });
  }

  // Inside a square: 16 px wide alone would make a tall picture's
  // placeholder thousands of pixels high.
  const blur = await source()
    .resize({ width: BLUR_SIZE, height: BLUR_SIZE, fit: "inside" })
    .webp({ quality: 40 })
    .toBuffer();

  return {
    width: base.width,
    height: base.height,
    blur: `data:image/webp;base64,${blur.toString("base64")}`,
    variants,
  };
}

async function decode(original: Uint8Array, maxInputPixels: number) {
  const widest = VARIANT_WIDTHS[VARIANT_WIDTHS.length - 1]!;
  try {
    const image = sharp(original, {
      limitInputPixels: maxInputPixels,
      // Photos re-saved by messengers and editors often carry harmless
      // decoder warnings; only what the decoder calls an error stops us.
      failOn: "error",
    });
    const metadata = await image.metadata();
    // sharp also reads SVG, GIF, TIFF and more: none of them is a photo.
    if (!INPUT_FORMATS.has(metadata.format)) {
      throw new UnprocessableImageError("not-an-image");
    }
    const { data, info } = await image
      .autoOrient()
      .resize({
        width: widest,
        height: MAX_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .raw()
      .toBuffer({ resolveWithObject: true });
    return {
      data,
      info,
      width: metadata.autoOrient.width,
      height: metadata.autoOrient.height,
    };
  } catch (error) {
    if (error instanceof UnprocessableImageError) throw error;
    // Everything sharp throws here is about this file's bytes: an unknown
    // format, broken data, a size over the limit.
    const message = error instanceof Error ? error.message : "";
    throw new UnprocessableImageError(
      /pixel limit/i.test(message) ? "too-many-pixels" : "not-an-image",
    );
  }
}
