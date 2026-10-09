// Sign-in policy values shared by the Better Auth config, the seed and tests.
// No imports: the env schema and client components read these too.

/** Staff passwords; Better Auth checks it when a password is set or changed. */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

/** A session lasts a week from sign-in; then staff sign in again. */
export const SESSION_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60;

/** Password attempts per client IP; TOTP has its own limits in Better Auth. */
export const SIGN_IN_RATE_LIMIT = { window: 60, max: 5 } as const;

/** Time to enter the TOTP code after the password, in seconds. */
export const TWO_FACTOR_CHALLENGE_SECONDS = 5 * 60;

/** Endpoints that create a session only after a second-factor check. */
export const TWO_FACTOR_PATHS: ReadonlySet<string> = new Set([
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
]);
