import { serveVariant } from "@/server/media/serve";

/**
 * A processed version of an uploaded image: /media/{id}/{width}, width one of
 * 320, 640, 1024, 1600 (docs/architecture.md#медиа). Pages build these URLs
 * with mediaSrc() and next/image.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/media/[id]/[width]">,
): Promise<Response> {
  const { id, width } = await params;
  return serveVariant(request, id, width);
}
