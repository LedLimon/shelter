"use client";

import type { ImageLoaderProps } from "next/image";
import { mediaIdOf, mediaUrl } from "./url";

/**
 * The loader of every next/image in the app (next.config.ts, `loaderFile`).
 * Uploaded media — `src={mediaSrc(id)}` — gets the URL of a version the
 * worker has already made (320, 640, 1024 or 1600 px): nothing is resized on
 * request, and `quality` is ignored. Any other image is served as it is: give
 * it `unoptimized`, or next/image warns that the loader ignores the width.
 */
export default function mediaImageLoader({
  src,
  width,
}: ImageLoaderProps): string {
  const id = mediaIdOf(src);
  return id ? mediaUrl(id, width) : src;
}
