import { describe, expect, it } from "vitest";
import {
  FIXTURE_API_SECRET,
  webhookFixtures,
} from "../../../../tests/fixtures/cloudpayments-webhooks";
import { signBody, verifySignature } from "./signature";

const SECRET = FIXTURE_API_SECRET;

// Computed with OpenSSL, not with the code under test:
//   printf '%s' "$body" | openssl dgst -sha256 -hmac "$secret" -binary | base64
const KNOWN = [
  {
    body: "TransactionId=1&Amount=10.00",
    secret: SECRET,
    hmac: "8J75pyzMTQx+EYg8cD0ZbpGPoEi5IheWEFF51NkNG+c=",
  },
  {
    body: "Amount=10.00&TransactionId=1",
    secret: SECRET,
    hmac: "u/aF3sNAqmaMBZOaH9+cgw5f2OXOile42C3QFy96LPI=",
  },
  {
    body: "Description=%D0%9F%D0%BE%D0%B6%D0%B5%D1%80%D1%82%D0%B2%D0%BE%D0%B2%D0%B0%D0%BD%D0%B8%D0%B5&Amount=10.00",
    secret: SECRET,
    hmac: "DluAI1QUJSba38XB/WaY6Nx7akSki0LJlYMZ9WFLK2o=",
  },
  // Bytes are UTF-8, in the body and in the key.
  {
    body: "Пожертвование",
    secret: "секрет",
    hmac: "lHhop+uVNh+Gate04BuVCrOvTaddb7rCipiUt0ZZaJU=",
  },
  {
    body: "",
    secret: SECRET,
    hmac: "aqq0C0DZoKDrw6uG49rhmOLAE2zt2NAHf06mDjaHMng=",
  },
] as const;

describe("signBody", () => {
  it.each(KNOWN)("is base64 HMAC-SHA256 of $body", ({ body, secret, hmac }) => {
    expect(signBody(body, secret)).toBe(hmac);
  });

  it.each(Object.entries(webhookFixtures))(
    "matches the independently signed %s fixture",
    (_name, fixture) => {
      expect(signBody(fixture.body, SECRET)).toBe(fixture.contentHmac);
    },
  );
});

describe("verifySignature", () => {
  const [first, reordered] = KNOWN;

  it.each(KNOWN)("accepts the signature of $body", ({ body, secret, hmac }) => {
    expect(verifySignature(body, hmac, secret)).toBe(true);
  });

  it("rejects a wrong signature", () => {
    // One bit off, and a valid signature of something else.
    const flipped = first.hmac.replace(/^8/, "9");
    expect(verifySignature(first.body, flipped, SECRET)).toBe(false);
    expect(verifySignature(first.body, reordered.hmac, SECRET)).toBe(false);
  });

  it.each([
    ["an amount", "TransactionId=1&Amount=10.01"],
    ["a longer amount", "TransactionId=1&Amount=100.00"],
    ["an added field", "TransactionId=1&Amount=10.00&InvoiceId=x"],
    ["a removed field", "TransactionId=1"],
    ["a trailing newline", "TransactionId=1&Amount=10.00\n"],
    ["a leading space", " TransactionId=1&Amount=10.00"],
    ["another case", "transactionid=1&amount=10.00"],
    ["an equivalent encoding", "TransactionId=1&Amount=10%2E00"],
    ["nothing", ""],
  ])("rejects a body changed by %s", (_what, body) => {
    expect(verifySignature(body, first.hmac, SECRET)).toBe(false);
  });

  it("rejects the same fields in another order", () => {
    expect(new URLSearchParams(reordered.body).get("Amount")).toBe("10.00");
    expect(verifySignature(reordered.body, first.hmac, SECRET)).toBe(false);
    // …which has a signature of its own.
    expect(verifySignature(reordered.body, reordered.hmac, SECRET)).toBe(true);
  });

  it("rejects a signature made with another secret", () => {
    const foreign = signBody(first.body, "another-secret");
    expect(verifySignature(first.body, foreign, SECRET)).toBe(false);
    expect(verifySignature(first.body, first.hmac, "another-secret")).toBe(
      false,
    );
    expect(verifySignature(first.body, first.hmac, `${SECRET} `)).toBe(false);
  });

  it.each([
    ["missing", null],
    ["undefined", undefined],
    ["empty", ""],
    ["not base64", "!!! not base64 !!!"],
    ["truncated", first.hmac.slice(0, 20)],
    [
      "hex instead of base64",
      "f09ef9a72ccc4d0c7e11883c703d196e918fa048b92217961051",
    ],
    ["doubled", `${first.hmac}${first.hmac}`],
    ["two header values", `${first.hmac}, ${first.hmac}`],
    ["the body itself", first.body],
  ])("rejects a %s signature", (_what, signature) => {
    expect(verifySignature(first.body, signature, SECRET)).toBe(false);
  });

  it("refuses to verify with an empty secret", () => {
    // HMAC with an empty key is computable by anyone.
    const forged = signBody(first.body, "");
    expect(() => verifySignature(first.body, forged, "")).toThrow(
      "the API secret is empty",
    );
  });
});
