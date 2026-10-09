import type { UserRole } from "@/generated/prisma/enums";
import { isStaffRole } from "./permissions";

/** A staff member whose session passed every admin check. */
export type StaffUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

/** The fields of a Better Auth session the admin checks depend on. */
export type SessionLike = {
  session: { twoFactorVerified?: boolean | null };
  user: {
    id: string;
    email: string;
    name: string;
    role?: UserRole | null;
    deletedAt?: Date | null;
    twoFactorEnabled?: boolean | null;
  };
};

export type AdminAccess =
  /** No session: sign in. */
  | { status: "anonymous" }
  /** Not staff, or deleted: 403. */
  | { status: "forbidden" }
  /** Staff without an authenticator yet: set one up first. */
  | { status: "needs-two-factor-setup"; user: StaffUser }
  /** Staff whose session didn't pass TOTP: sign in again with the code. */
  | { status: "needs-two-factor"; user: StaffUser }
  | { status: "granted"; user: StaffUser };

/**
 * Whether a session may use the admin. Pure, so every branch is unit-tested;
 * requireStaff() and getStaffUser() in ./session apply it to the request.
 */
export function adminAccessOf(session: SessionLike | null): AdminAccess {
  if (!session) return { status: "anonymous" };

  const { user } = session;
  const role = user.role ?? "DONOR";
  if (user.deletedAt || !isStaffRole(role)) return { status: "forbidden" };

  const staff: StaffUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role,
  };
  if (!user.twoFactorEnabled) {
    return { status: "needs-two-factor-setup", user: staff };
  }
  if (session.session.twoFactorVerified !== true) {
    return { status: "needs-two-factor", user: staff };
  }
  return { status: "granted", user: staff };
}
