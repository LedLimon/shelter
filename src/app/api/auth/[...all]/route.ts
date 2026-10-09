import { getAuth } from "@/server/auth";

// Better Auth's endpoints: /api/auth/sign-in/email, /api/auth/two-factor/…
// The instance is created on the first request, not when the build imports
// this module.
function handler(request: Request): Promise<Response> {
  return getAuth().handler(request);
}

export { handler as GET, handler as POST };
