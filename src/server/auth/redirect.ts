const ADMIN_HOME = "/admin";

/**
 * Where to go after sign-in: the admin page the proxy sent the user away
 * from, or the admin home. Anything else (other sites, `//host`, the sign-in
 * page itself) is ignored, so the parameter can't become an open redirect.
 */
export function adminRedirectTarget(
  next: string | string[] | undefined,
): string {
  if (typeof next !== "string") return ADMIN_HOME;

  let url: URL;
  try {
    // Resolving against a dummy origin normalizes `/admin/../x` and spots
    // `//evil.example` and `https://…`, which land on another origin.
    url = new URL(next, "http://shelter.invalid");
  } catch {
    return ADMIN_HOME;
  }
  if (url.origin !== "http://shelter.invalid") return ADMIN_HOME;

  const { pathname } = url;
  const isAdmin =
    pathname === ADMIN_HOME || pathname.startsWith(`${ADMIN_HOME}/`);
  if (!isAdmin || pathname.startsWith("/admin/login")) return ADMIN_HOME;
  return pathname + url.search;
}
