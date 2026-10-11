import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * CloudPayments signs a notification twice: Content-HMAC over the body as
 * sent (URL-encoded), X-Content-HMAC over the URL-decoded parameters. We
 * check the first: it covers the exact bytes we receive, so nothing has to be
 * decoded — or guessed — before the signature holds.
 */
export const SIGNATURE_HEADER = "Content-HMAC";

// Base64 of 32 bytes. Checked before decoding: Node's decoder is lenient and
// would read "<signature>, <anything>" as the signature alone.
const SHA256_BASE64 = /^[A-Za-z0-9+/]{43}=$/;

/** HMAC-SHA256 of the body's UTF-8 bytes, keyed with the API Secret. */
function hmac(rawBody: string, apiSecret: string): Buffer {
  return createHmac("sha256", apiSecret).update(rawBody, "utf8").digest();
}

/** The Content-HMAC value of a body: base64 of its HMAC-SHA256. */
export function signBody(rawBody: string, apiSecret: string): string {
  return hmac(rawBody, apiSecret).toString("base64");
}

/**
 * Whether `signature` (a Content-HMAC header) is the HMAC of `rawBody`.
 * Compared in constant time; a missing or malformed header is simply wrong.
 */
export function verifySignature(
  rawBody: string,
  signature: string | null | undefined,
  apiSecret: string,
): boolean {
  // An empty key would make every signature computable by anyone.
  if (!apiSecret) throw new Error("payments: the API secret is empty");
  // The format is public; only the digest bytes need constant time.
  if (!signature || !SHA256_BASE64.test(signature)) return false;
  return timingSafeEqual(
    Buffer.from(signature, "base64"),
    hmac(rawBody, apiSecret),
  );
}
