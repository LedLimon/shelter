import { variantWidthFor, type VariantWidth } from "./constraints";

// Processed images are served by the app itself: /media/{id}/{width}
// (src/app/media). Free of server imports: pages, the image loader and the
// uploader all build these URLs.

const MEDIA_PATH = "/media";
// A cuid2 id: Media.id.
const MEDIA_SRC = /^\/media\/([a-z0-9]{16,32})$/;

/**
 * `src` of a media for next/image: the loader (./image-loader.ts) turns it
 * into the URL of a processed width.
 */
export function mediaSrc(id: string): string {
  return `${MEDIA_PATH}/${id}`;
}

/** The media id of a `src` made by mediaSrc(); null for any other image. */
export function mediaIdOf(src: string): string | null {
  return MEDIA_SRC.exec(src)?.[1] ?? null;
}

/**
 * URL of a processed version at least `width` pixels wide (the widest one, if
 * none is). One URL per width: the route answers with AVIF or WebP, whichever
 * the browser accepts.
 */
export function mediaUrl(id: string, width: number): string {
  const variant: VariantWidth = variantWidthFor(width);
  return `${MEDIA_PATH}/${id}/${variant}`;
}
