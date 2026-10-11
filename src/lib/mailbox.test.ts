import { describe, expect, it } from "vitest";
import { isEmailAddress, parseMailbox } from "./mailbox";

describe("isEmailAddress", () => {
  it.each([
    "donor@example.ru",
    "a.b+tag@sub.example.com",
    "иван@почта.рф",
    "o'brien@example.com",
  ])("accepts %s", (address) => {
    expect(isEmailAddress(address)).toBe(true);
  });

  it.each([
    "",
    "donor",
    "donor@",
    "@example.ru",
    "a@b@c",
    "donor @example.ru",
    // Would be two recipients, or a header, once on an envelope.
    "a@x.ru, b@y.ru",
    "a@x.ru;b@y.ru",
    "Имя <a@x.ru>",
    '"a"@x.ru',
    "a\u0000b@x.ru",
    "a\u007Fb@x.ru",
    "a@x.ru\r\nBcc: b@y.ru",
    `${"a".repeat(320)}@x.ru`,
  ])("rejects %j", (value) => {
    expect(isEmailAddress(value)).toBe(false);
  });
});

describe("parseMailbox", () => {
  it("takes a bare address", () => {
    expect(parseMailbox(" no-reply@shelter.localhost ")).toEqual({
      address: "no-reply@shelter.localhost",
    });
  });

  it("takes a name before the address, quoted or not", () => {
    expect(parseMailbox("Приют <no-reply@shelter.localhost>")).toEqual({
      name: "Приют",
      address: "no-reply@shelter.localhost",
    });
    expect(parseMailbox('"Мыс, приют" <a@x.ru>')).toEqual({
      name: "Мыс, приют",
      address: "a@x.ru",
    });
  });

  it("has no name when the brackets hold the address alone", () => {
    expect(parseMailbox("<a@x.ru>")).toEqual({ address: "a@x.ru" });
  });

  it.each(["", "Приют", "Приют <>", "Приют <a@x.ru", "a@x.ru, b@y.ru"])(
    "rejects %j",
    (value) => {
      expect(parseMailbox(value)).toBeNull();
    },
  );
});
