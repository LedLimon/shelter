// RFC 6238 TOTP, as authenticator apps compute it, written independently of
// Better Auth so tests catch a format mismatch. Better Auth uses the UTF-8
// bytes of its stored secret as the HMAC key (the app gets them in base32).
import { createHmac } from "node:crypto";

const PERIOD_SECONDS = 30;

export function totp(secret: string, at: number = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / PERIOD_SECONDS)));
  const hmac = createHmac("sha1", Buffer.from(secret, "utf8"))
    .update(counter)
    .digest();
  const offset = (hmac.at(-1) ?? 0) & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

/** A code Better Auth rejects now: none of the periods in its ±1 window. */
export function wrongTotp(secret: string): string {
  const now = Date.now();
  const valid = [-1, 0, 1].map((step) =>
    totp(secret, now + step * PERIOD_SECONDS * 1000),
  );
  return ["000000", "111111", "222222", "333333"].find(
    (code) => !valid.includes(code),
  )!;
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** The raw secret behind the `secret=` of an otpauth:// URI. */
export function secretFromOtpauth(uri: string): string {
  const encoded = new URL(uri).searchParams.get("secret") ?? "";
  let bits = "";
  for (const char of encoded.replace(/=+$/, "")) {
    const value = BASE32.indexOf(char.toUpperCase());
    if (value < 0) throw new Error(`Not base32: ${char}`);
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = bits.match(/.{8}/g)?.map((byte) => parseInt(byte, 2)) ?? [];
  return Buffer.from(bytes).toString("utf8");
}
