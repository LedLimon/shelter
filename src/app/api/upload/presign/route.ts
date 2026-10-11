import { z } from "zod";
import { MediaKind } from "@/generated/prisma/enums";
import { getDb } from "@/server/db";
import { requestUpload } from "@/server/media";
import { asUploader, readBody } from "@/server/media/http";

const schema = z.object({
  kind: z.enum(MediaKind),
  mime: z.string().max(100),
  byteSize: z.number().int().positive(),
});

/**
 * Starts an upload (docs/architecture.md#медиа): staff with `media.upload`
 * name the file's kind, type and size and get a URL to PUT exactly that file
 * to, straight into the private bucket, and the id of its Media.
 */
export function POST(request: Request): Promise<Response> {
  return asUploader(request, async (user) => {
    const input = await readBody(request, schema);
    const ticket = await requestUpload(getDb(), user, input);
    return Response.json(ticket, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  });
}
