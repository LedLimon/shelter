import "server-only";
import {
  VARIANT_WIDTHS,
  type VariantFormat,
  type VariantWidth,
} from "@/lib/media/constraints";
import { isPublicMedia } from "@/lib/media/visibility";
import { can } from "@/server/auth/permissions";
import { getStaffUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { getStorage } from "@/server/storage";
import { variantKey } from "./keys";

// GET /media/{id}/{width}: the only way a file leaves the bucket. It serves
// processed versions and nothing else — the original has no URL at all.

/** A year, and never revalidated: a media's versions don't change. */
const PHOTO_CACHE = "public, max-age=31536000, immutable";
/**
 * A published document may be unpublished again (a card number was missed):
 * browsers keep it for minutes, shared caches not at all.
 */
const DOCUMENT_CACHE = "private, max-age=300";
/** A document only staff may see yet. */
const STAFF_CACHE = "private, no-store";

/**
 * The processed version of a media, `width` pixels wide, in the best format
 * the browser accepts. 404 unless the media is READY and public
 * (isPublicMedia()) — or the request comes from staff who may upload: they
 * see documents before publishing them.
 */
export async function serveVariant(
  request: Request,
  id: string,
  width: string,
): Promise<Response> {
  const variant = parseWidth(width);
  if (!variant) return notFound();

  const media = await getDb().media.findUnique({
    where: { id },
    select: { kind: true, status: true, redacted: true },
  });
  if (!media || media.status !== "READY") return notFound();

  const isPublic = isPublicMedia(media);
  // The session is read only for what the public may not see: a photo
  // request costs one query. No 403: an outsider learns nothing from a 404.
  if (!isPublic && !can(await getStaffUser(), "media.upload")) {
    return notFound();
  }

  const format = formatFor(request.headers.get("accept"));
  const object = await getStorage().get(
    variantKey(id, variant, format),
    request.signal,
  );
  if (!object) return notFound();

  const headers = new Headers({
    "Content-Type": `image/${format}`,
    "Cache-Control": !isPublic
      ? STAFF_CACHE
      : media.kind === "PHOTO"
        ? PHOTO_CACHE
        : DOCUMENT_CACHE,
    // The format depends on Accept; what staff see, on their cookie.
    Vary: isPublic ? "Accept" : "Accept, Cookie",
    "X-Content-Type-Options": "nosniff",
  });
  if (object.byteSize !== null) {
    headers.set("Content-Length", String(object.byteSize));
  }
  if (object.etag) headers.set("ETag", object.etag);
  return new Response(object.body, { headers });
}

/** AVIF for a browser that says it takes it, WebP for everyone else. */
export function formatFor(accept: string | null): VariantFormat {
  return accept?.toLowerCase().includes("image/avif") ? "avif" : "webp";
}

function parseWidth(value: string): VariantWidth | null {
  return VARIANT_WIDTHS.find((width) => String(width) === value) ?? null;
}

function notFound(): Response {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}
