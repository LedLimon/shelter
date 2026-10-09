import { randomInt } from "node:crypto";

/** No 0/o and 1/i/l: backup codes get typed in from paper. */
export const BACKUP_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const BACKUP_CODE_COUNT = 10;

/** Ten one-time codes like `k7m2p-xq9ra` (about 50 bits each). */
export function generateBackupCodes(): string[] {
  return Array.from({ length: BACKUP_CODE_COUNT }, () => {
    let code = "";
    for (let i = 0; i < 10; i += 1) {
      code += BACKUP_CODE_ALPHABET[randomInt(BACKUP_CODE_ALPHABET.length)];
    }
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  });
}
