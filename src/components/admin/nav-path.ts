/**
 * Whether the path is inside the section: the dashboard only at /admin
 * itself, the others on their nested pages too (/admin/needs/42). Apart from
 * the menu config, so the browser gets this function without the registry.
 */
export function isSectionPath(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
