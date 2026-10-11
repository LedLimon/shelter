import { z } from "zod";
import { getDb } from "@/server/db";
import { completeUpload } from "@/server/media";
import { asUploader, readBody } from "@/server/media/http";

const schema = z.object({ id: z.string().min(1).max(64) });

/** The file is in the bucket: checks that and queues its processing. */
export function POST(request: Request): Promise<Response> {
  return asUploader(request, async (user) => {
    const { id } = await readBody(request, schema);
    const state = await completeUpload(getDb(), user, id);
    return Response.json(state, { headers: { "Cache-Control": "no-store" } });
  });
}
