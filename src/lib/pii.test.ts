import { describe, expect, it } from "vitest";
import { maskEmail, maskPii } from "@/lib/pii";

describe("maskPii", () => {
  it.each([
    [
      "550 5.1.1 <anna.ivanova@example.ru>: Recipient address rejected",
      "550 5.1.1 <[email]>: Recipient address rejected",
    ],
    ["Не доставлено: донор@почта.рф", "Не доставлено: [email]"],
    ["to=a@b.ru, cc=c@d.ru", "to=[email], cc=[email]"],
    [
      "connect to postgresql://shelter:secret@db.internal:5432/shelter",
      "connect to postgresql://shelter:[email]:5432/shelter",
    ],
  ])("masks email addresses: %s", (text, expected) => {
    expect(maskPii(text)).toBe(expected);
  });

  it.each([
    ["Звонили с +7 (900) 123-45-67 дважды", "Звонили с [number] дважды"],
    ["phone 89001234567", "phone [number]"],
    ["card 4242 4242 4242 4242 declined", "card [number] declined"],
  ])("masks phone and card numbers: %s", (text, expected) => {
    expect(maskPii(text)).toBe(expected);
  });

  it("stays fast on a long text without separators", () => {
    const started = performance.now();

    expect(maskPii("QUJD".repeat(250_000))).toHaveLength(1_000_000);

    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it.each([
    "connect ECONNREFUSED 127.0.0.1:1025",
    "connect ETIMEDOUT 192.168.100.200:5432",
    "timed out after 120 s",
    "donation cmgk3x9f20000abcdqwerty12 not found",
    "status 502, attempt 3 of 10",
  ])("keeps text without personal data: %s", (text) => {
    expect(maskPii(text)).toBe(text);
  });
});

describe("maskEmail", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskEmail("irina.petrova@example.ru")).toBe("i•••@example.ru");
    expect(maskEmail("a@b.ru")).toBe("a•••@b.ru");
  });

  it("shows nothing of a string that is not an address", () => {
    expect(maskEmail("@example.ru")).toBe("•••");
    expect(maskEmail("irina")).toBe("•••");
  });
});
