// Users the e2e suite signs in as. e2e/global-setup.ts creates them (and
// resets what tests change) before every run. Not secrets: they exist only in
// local and CI databases, and the setup refuses any other database.

export const E2E_PASSWORD = "e2e-password-not-secret";
export const E2E_TOTP_SECRET = "e2e-totp-secret-not-secret-0123";

export const E2E_USERS = {
  /** Staff with TOTP set up: the owner of the shelter. */
  owner: "e2e-owner@shelter.localhost",
  /** A donor who somehow has a password: must get 403 in the admin. */
  donor: "e2e-donor@shelter.localhost",
} as const;

/** Staff on their first sign-in, one per Playwright project (they run in parallel). */
export function newStaffEmail(project: string): string {
  return `e2e-new-staff-${project}@shelter.localhost`;
}

export const E2E_PROJECTS = ["desktop", "mobile"] as const;
