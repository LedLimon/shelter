import "server-only";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import { adminAccessOf, type AdminAccess, type StaffUser } from "./access";
import { getAuth } from "./index";
import { can, type Permission } from "./permissions";

export type { StaffUser } from "./access";

export const ADMIN_LOGIN_PATH = "/admin/login";
export const TWO_FACTOR_SETUP_PATH = "/admin/two-factor";

/** The request's session, read from the database once per render. */
export const getSession = cache(async () =>
  getAuth().api.getSession({ headers: await headers() }),
);

export async function getAdminAccess(): Promise<AdminAccess> {
  return adminAccessOf(await getSession());
}

/**
 * Guard for admin layouts and pages: returns the staff member or ends the
 * render — sign-in, TOTP setup, or 403. Layouts don't cover server actions:
 * those call getStaffUser() and assertCan() themselves.
 */
export async function requireStaff(
  permission: Permission = "admin.access",
): Promise<StaffUser> {
  const access = await getAdminAccess();
  switch (access.status) {
    case "anonymous":
    case "needs-two-factor":
      return redirect(ADMIN_LOGIN_PATH);
    case "needs-two-factor-setup":
      return redirect(TWO_FACTOR_SETUP_PATH);
    case "forbidden":
      return forbidden();
    case "granted":
      if (!can(access.user, permission)) forbidden();
      return access.user;
  }
}

/**
 * For server actions and route handlers: the staff member whose session
 * passed TOTP, or null. Follow with assertCan(user, permission).
 */
export async function getStaffUser(): Promise<StaffUser | null> {
  const access = await getAdminAccess();
  return access.status === "granted" ? access.user : null;
}
