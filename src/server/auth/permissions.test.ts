import { describe, expect, it } from "vitest";
import { UserRole } from "@/generated/prisma/enums";
import {
  assertCan,
  can,
  ForbiddenError,
  isStaffRole,
  PERMISSIONS,
  permissionsOf,
  type Permission,
} from "./permissions";

// The whole matrix, written out by hand: changing who may do what has to
// change this table too (and docs/product.md#роли).
const EXPECTED: Record<UserRole, Permission[]> = {
  DONOR: [],
  VOLUNTEER: [],
  COORDINATOR: ["admin.access", "dogs.view", "volunteers.manage"],
  EDITOR: [
    "admin.access",
    "needs.edit",
    "dogs.view",
    "dogs.edit",
    "content.edit",
    "expenses.draft",
  ],
  ADMIN: [
    "admin.access",
    "needs.edit",
    "needs.publish",
    "dogs.view",
    "dogs.edit",
    "content.edit",
    "expenses.draft",
    "expenses.post",
    "ledger.settle",
    "ledger.transfer",
    "donations.view",
    "donations.manual",
    "donations.refund",
    "inkind.confirm",
  ],
  OWNER: Object.keys(PERMISSIONS) as Permission[],
};

const roles = Object.values(UserRole);

describe("permission matrix", () => {
  it.each(roles)("%s has exactly its permissions", (role) => {
    expect(permissionsOf(role)).toEqual(EXPECTED[role]);
  });

  it("covers every role", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...roles].sort());
  });

  it("gives the owner everything", () => {
    for (const permission of Object.keys(PERMISSIONS) as Permission[]) {
      expect(can({ role: "OWNER" }, permission)).toBe(true);
    }
  });

  it("keeps money and people away from curators and coordinators", () => {
    const sensitive: Permission[] = [
      "needs.publish",
      "expenses.post",
      "ledger.settle",
      "ledger.transfer",
      "ledger.reverse",
      "donations.view",
      "donations.refund",
      "reports.publish",
      "users.manage",
      "settings.edit",
    ];
    for (const role of ["COORDINATOR", "EDITOR"] as const) {
      for (const permission of sensitive) {
        expect(can({ role }, permission), `${role} ${permission}`).toBe(false);
      }
    }
  });

  it("lets into the admin exactly the staff roles", () => {
    for (const role of roles) {
      expect(can({ role }, "admin.access")).toBe(isStaffRole(role));
    }
    expect(roles.filter(isStaffRole)).toEqual([
      "COORDINATOR",
      "EDITOR",
      "ADMIN",
      "OWNER",
    ]);
  });
});

describe("can", () => {
  it("denies when there is no user", () => {
    expect(can(null, "admin.access")).toBe(false);
    expect(can(undefined, "admin.access")).toBe(false);
  });
});

describe("assertCan", () => {
  it("passes a user with the permission", () => {
    const user = { id: "u1", role: "ADMIN" as const };

    expect(() => assertCan(user, "expenses.post")).not.toThrow();
  });

  it("throws ForbiddenError naming the permission", () => {
    expect(() => assertCan({ role: "EDITOR" }, "expenses.post")).toThrow(
      new ForbiddenError("expenses.post"),
    );
    expect(() => assertCan(null, "admin.access")).toThrow(ForbiddenError);
  });
});
