import { MAX_STATUS_IDS } from "@/lib/media/constraints";
import { getDb } from "@/server/db";
import { getMediaStates, MediaError } from "@/server/media";
import { asUploader } from "@/server/media/http";

/**
 * Where the worker is with these files: `?id=…&id=…`. The uploader polls it
 * until every file is READY or FAILED.
 */
export function GET(request: Request): Promise<Response> {
  return asUploader(request, async () => {
    const ids = new URL(request.url).searchParams.getAll("id");
    if (ids.length === 0 || ids.length > MAX_STATUS_IDS) {
      throw new MediaError("invalid");
    }
    const items = await getMediaStates(getDb(), ids);
    return Response.json(
      { items },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
