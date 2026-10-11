import Image, { type ImageProps } from "next/image";
import { mediaSrc } from "@/lib/media/url";

type MediaImageProps = Omit<
  ImageProps,
  "src" | "width" | "height" | "placeholder" | "blurDataURL" | "loader"
> & {
  /** A READY media: its size and blur come from the worker. */
  media: {
    id: string;
    width: number | null;
    height: number | null;
    blur: string | null;
  };
  /**
   * How wide the image is shown, as in `<img sizes>`: the browser picks one
   * of the processed widths (320, 640, 1024, 1600) by it.
   */
  sizes: string;
};

/**
 * An uploaded image on a page: next/image over the versions the worker made
 * (src/lib/media/image-loader.ts), with the real proportions — no layout
 * shift — and the blurred placeholder while it loads. Renders nothing for a
 * media that is not processed yet. Works in Server Components.
 */
export function MediaImage({ media, alt, ...image }: MediaImageProps) {
  if (media.width === null || media.height === null) return null;
  return (
    <Image
      {...image}
      alt={alt}
      src={mediaSrc(media.id)}
      width={media.width}
      height={media.height}
      placeholder={media.blur ? "blur" : "empty"}
      blurDataURL={media.blur ?? undefined}
    />
  );
}
