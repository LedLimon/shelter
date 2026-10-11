// Who may do what: permission → roles (docs/product.md#роли). Pure and free of
// server imports, so client components can hide controls with can() too; the
// server still checks every action itself.
import { UserRole } from "@/generated/prisma/enums";

/** Roles that work in the admin. DONOR and VOLUNTEER have only their account. */
export const STAFF_ROLES = [
  UserRole.COORDINATOR,
  UserRole.EDITOR,
  UserRole.ADMIN,
  UserRole.OWNER,
] as const satisfies readonly UserRole[];

const STAFF = STAFF_ROLES;
/** Curators write; admins and the owner may do whatever curators do. */
const CONTENT = [UserRole.EDITOR, UserRole.ADMIN, UserRole.OWNER] as const;
const MONEY = [UserRole.ADMIN, UserRole.OWNER] as const;
const OWNER = [UserRole.OWNER] as const;

export const PERMISSIONS = {
  /** Open the admin at all. */
  "admin.access": STAFF,

  /** Create needs and edit them; a curator's need stays a draft. */
  "needs.edit": CONTENT,
  /** Publish, close early, move along the status machine, cancel. */
  "needs.publish": MONEY,

  /** See dogs in the admin (coordinators plan walks). */
  "dogs.view": STAFF,
  /** Dogs, their photos and news. */
  "dogs.edit": CONTENT,
  /** Site news and «Они дома» stories. */
  "content.edit": CONTENT,

  /** Expense drafts with receipts and invoices. */
  "expenses.draft": CONTENT,
  /** Post an expense to the ledger. */
  "expenses.post": MONEY,
  /** Move a need's surplus to the general fund or cover its shortfall. */
  "ledger.settle": MONEY,
  /** Transfers out of the general fund. */
  "ledger.transfer": MONEY,
  /** Reversal entries. */
  "ledger.reverse": OWNER,
  /** Donations and subscriptions with donor emails. */
  "donations.view": MONEY,
  /** Bank and cash donations entered by hand. */
  "donations.manual": MONEY,
  "donations.refund": MONEY,
  /** Publish the monthly report, which closes the month. */
  "reports.publish": OWNER,

  /** Mark goods brought for a need as received. */
  "inkind.confirm": MONEY,
  /** Volunteers, shifts and tasks. */
  "volunteers.manage": [UserRole.COORDINATOR, UserRole.OWNER],

  /** Staff accounts and roles. */
  "users.manage": OWNER,
  /** Shelter settings, bank details and payment settings included. */
  "settings.edit": OWNER,
  /** Offer, privacy policy and other legal documents. */
  "legal.edit": OWNER,
  "audit.view": OWNER,
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

/** The part of a user that permissions depend on. */
export type WithRole = { role: UserRole };

export function isStaffRole(role: UserRole): boolean {
  return (STAFF_ROLES as readonly UserRole[]).includes(role);
}

/**
 * Whether the user's role grants the permission. Says nothing about the
 * session: take the user from getStaffUser() / requireStaff(), which also
 * check the second factor.
 */
export function can(
  user: WithRole | null | undefined,
  permission: Permission,
): boolean {
  if (!user) return false;
  return (PERMISSIONS[permission] as readonly UserRole[]).includes(user.role);
}

export class ForbiddenError extends Error {
  override name = "ForbiddenError";

  constructor(readonly permission: Permission) {
    super(`Missing permission: ${permission}`);
  }
}

/** can() for server actions and route handlers: throws ForbiddenError. */
export function assertCan<User extends WithRole>(
  user: User | null | undefined,
  permission: Permission,
): asserts user is User {
  if (!can(user, permission)) throw new ForbiddenError(permission);
}

/** Every permission of a role, in declaration order. */
export function permissionsOf(role: UserRole): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((permission) =>
    can({ role }, permission),
  );
}
