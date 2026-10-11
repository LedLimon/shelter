// Users the e2e suite signs in as. e2e/global-setup.ts creates them (and
// resets what tests change) before every run. Not secrets: they exist only in
// local and CI databases, and the setup refuses any other database.

export const E2E_PASSWORD = "e2e-password-not-secret";
export const E2E_TOTP_SECRET = "e2e-totp-secret-not-secret-0123";

export const E2E_USERS = {
  /** Staff with TOTP set up: the owner of the shelter. */
  owner: "e2e-owner@shelter.localhost",
  /** Staff with TOTP set up and narrower roles: what the menu hides from them. */
  editor: "e2e-editor@shelter.localhost",
  coordinator: "e2e-coordinator@shelter.localhost",
  /** A donor who somehow has a password: must get 403 in the admin. */
  donor: "e2e-donor@shelter.localhost",
} as const;

/**
 * Staff on their first sign-in: one per Playwright project (they run in
 * parallel) and per attempt (a retry finds the previous attempt's TOTP set).
 */
export function newStaffEmail(project: string, retry: number): string {
  return `e2e-new-staff-${project}-${retry}@shelter.localhost`;
}

export const E2E_PROJECTS = ["desktop", "mobile"] as const;
/** CI retries a failed test once (playwright.config.ts); one spare attempt. */
export const E2E_ATTEMPTS = 3;

/** A consent to the newsletter that a test withdraws; see unsubscribeToken(). */
export const UNSUBSCRIBE_VARIANTS = ["js", "no-js"] as const;

/**
 * The token of an unsubscribe link (the id of a newsletter consent) made for
 * one attempt of one test. A withdrawn consent can't be given back, so every
 * run — E2E_RUN_ID, set by e2e/global-setup.ts — has its own.
 */
export function unsubscribeToken(
  project: string,
  retry: number,
  variant: (typeof UNSUBSCRIBE_VARIANTS)[number],
): string {
  return `e2e-${process.env.E2E_RUN_ID ?? "run"}-${project}-${retry}-${variant}`;
}

/** Dev and test databases: the seed's owner is at this domain (.env.example). */
export const LOCAL_EMAIL_DOMAIN = "@shelter.localhost";
