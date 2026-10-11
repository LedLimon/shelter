import "server-only";
import type { z } from "zod";
import { getEnv } from "@/lib/env";
import type { UploadErrorBody, UploadErrorCode } from "@/lib/media/types";
import { assertCan, ForbiddenError } from "@/server/auth/permissions";
import { getStaffUser, type StaffUser } from "@/server/auth/session";
import { MediaError } from "./errors";

// What the upload endpoints (src/app/api/upload) share: who may call them and
// how a refusal looks. A route handler checks access itself — nothing wraps
// it the way adminAction() wraps a server action.

/** A refusal as JSON: the code for the program, the message for the user. */
export function uploadError(code: UploadErrorCode): Response {
  const error = new MediaError(code);
  const body: UploadErrorBody = { error: { code, message: error.message } };
  return Response.json(body, {
    status: error.status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Runs an upload endpoint for a staff member who may upload: the session
 * (with its second factor), then the permission, then the handler. A
 * MediaError the handler throws becomes its JSON answer.
 */
export async function asUploader(
  request: Request,
  handler: (user: StaffUser) => Promise<Response>,
): Promise<Response> {
  if (!isSameOrigin(request)) return uploadError("forbidden");
  const user = await getStaffUser();
  if (!user) return uploadError("unauthorized");
  try {
    assertCan(user, "media.upload");
    return await handler(user);
  } catch (error) {
    if (error instanceof ForbiddenError) return uploadError("forbidden");
    if (error instanceof MediaError) return uploadError(error.code);
    throw error;
  }
}

/** The request's JSON body, checked; anything else is an "invalid" refusal. */
export async function readBody<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<z.output<Schema>> {
  const body: unknown = await request.json().catch(() => undefined);
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new MediaError("invalid");
  return parsed.data;
}

/**
 * A browser names the page that sent a POST in `Origin`: only our own pages
 * may change anything. On top of the session cookie's SameSite, like the
 * origin check of /api/auth.
 */
function isSameOrigin(request: Request): boolean {
  if (request.method === "GET" || request.method === "HEAD") return true;
  const origin = request.headers.get("origin");
  return origin === null || origin === new URL(getEnv().APP_URL).origin;
}
