/**
 * A backup code as typed — any case, spaces, with or without the hyphen —
 * in the form Better Auth stores (`k7m2p-xq9ra`, src/server/auth/backup-codes.ts).
 * It compares codes exactly, so the form normalizes before sending.
 */
export function normalizeBackupCode(input: string): string {
  const compact = input.toLowerCase().replace(/[\s-]/g, "");
  return compact.length === 10
    ? `${compact.slice(0, 5)}-${compact.slice(5)}`
    : input.trim().toLowerCase();
}
