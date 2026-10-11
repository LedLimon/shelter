import { randomUUID } from "node:crypto";
import {
  VARIANT_FORMATS,
  VARIANT_WIDTHS,
  type VariantFormat,
  type VariantWidth,
} from "@/lib/media/constraints";

// Where a media's files live in the bucket. The bucket is private; only
// variants are ever served, and only by src/app/media.

/** A new key for an original: random, so it says nothing about the file. */
export function newOriginalKey(): string {
  return `originals/${randomUUID()}`;
}

export function variantKey(
  mediaId: string,
  width: VariantWidth,
  format: VariantFormat,
): string {
  return `variants/${mediaId}/${width}.${format}`;
}

/** Every processed version of a media. */
export function variantKeys(mediaId: string): string[] {
  return VARIANT_WIDTHS.flatMap((width) =>
    VARIANT_FORMATS.map((format) => variantKey(mediaId, width, format)),
  );
}
