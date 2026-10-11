import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic admin guard: without a session cookie, go to sign-in and come
 * back afterwards. Only checks that the cookie exists — the session, role and
 * second factor are checked against the database by requireStaff() in the
 * admin layout, and by every server action.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/admin/login" || getSessionCookie(request)) {
    return NextResponse.next();
  }

  const login = new URL("/admin/login", request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: "/admin/:path*",
};
