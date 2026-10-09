import { describe, expect, it } from "vitest";
import { UserRole } from "@/generated/prisma/enums";
import { adminAccessOf, type SessionLike } from "./access";

function sessionOf({
  role = "ADMIN",
  twoFactorEnabled = true,
  twoFactorVerified = true,
  deletedAt = null,
}: {
  role?: UserRole;
  twoFactorEnabled?: boolean;
  twoFactorVerified?: boolean;
  deletedAt?: Date | null;
} = {}): SessionLike {
  return {
    session: { twoFactorVerified },
    user: {
      id: "u1",
      email: "staff@shelter.localhost",
      name: "Анна",
      role,
      deletedAt,
      twoFactorEnabled,
    },
  };
}

const staff = {
  id: "u1",
  email: "staff@shelter.localhost",
  name: "Анна",
};

describe("adminAccessOf", () => {
  it("sends a visitor without a session to sign in", () => {
    expect(adminAccessOf(null)).toEqual({ status: "anonymous" });
  });

  it("grants staff whose session passed TOTP", () => {
    for (const role of ["COORDINATOR", "EDITOR", "ADMIN", "OWNER"] as const) {
      expect(adminAccessOf(sessionOf({ role }))).toEqual({
        status: "granted",
        user: { ...staff, role },
      });
    }
  });

  it("forbids donors and volunteers, even with TOTP", () => {
    for (const role of ["DONOR", "VOLUNTEER"] as const) {
      expect(adminAccessOf(sessionOf({ role })).status).toBe("forbidden");
      expect(
        adminAccessOf(sessionOf({ role, twoFactorEnabled: false })).status,
      ).toBe("forbidden");
    }
  });

  it("treats a missing role as a donor", () => {
    const session = sessionOf();
    session.user.role = null;

    expect(adminAccessOf(session).status).toBe("forbidden");
  });

  it("forbids deleted staff", () => {
    expect(
      adminAccessOf(sessionOf({ role: "OWNER", deletedAt: new Date() })).status,
    ).toBe("forbidden");
  });

  it("keeps staff without an authenticator on the setup screen", () => {
    expect(
      adminAccessOf(
        sessionOf({ twoFactorEnabled: false, twoFactorVerified: false }),
      ),
    ).toEqual({
      status: "needs-two-factor-setup",
      user: { ...staff, role: "ADMIN" },
    });
  });

  it("refuses a session that skipped TOTP although the user has it", () => {
    expect(adminAccessOf(sessionOf({ twoFactorVerified: false })).status).toBe(
      "needs-two-factor",
    );

    const session = sessionOf();
    delete session.session.twoFactorVerified;
    expect(adminAccessOf(session).status).toBe("needs-two-factor");
  });
});
