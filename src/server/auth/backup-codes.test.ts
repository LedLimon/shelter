import { describe, expect, it } from "vitest";
import {
  BACKUP_CODE_ALPHABET,
  BACKUP_CODE_COUNT,
  generateBackupCodes,
} from "./backup-codes";

describe("generateBackupCodes", () => {
  it("makes ten distinct codes without look-alike characters", () => {
    const codes = generateBackupCodes();

    expect(codes).toHaveLength(BACKUP_CODE_COUNT);
    expect(new Set(codes).size).toBe(BACKUP_CODE_COUNT);
    for (const code of codes) {
      expect(code).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
      for (const char of code.replace("-", "")) {
        expect(BACKUP_CODE_ALPHABET).toContain(char);
      }
    }
    expect(BACKUP_CODE_ALPHABET).not.toMatch(/[01ilo]/);
  });
});
