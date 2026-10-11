import { z } from "zod";
import { getDb } from "@/server/db";
import { discardUpload } from "@/server/media";
import { asUploader, readBody } from "@/server/media/http";

const schema = z.object({ id: z.string().min(1).max(64) });

/**
 * The uploader took a file out of the form before saving: removes it, unless
 * it is someone else's or something already uses it.
 */
export function POST(request: Request): Promise<Response> {
  return asUploader(request, async (user) => {
    const { id } = await readBody(request, schema);
    const discarded = await discardUpload(getDb(), user, id);
    return Response.json(
      { discarded },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
