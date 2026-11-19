import { createHmac, timingSafeEqual } from "node:crypto";

const HEX_SHA256 = /^[0-9a-f]{64}$/i;

// The HMAC covers the raw request bytes, before any JSON parsing, so a body
// that is re-serialized differently can never match by accident.
export function verifySignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  // Buffer.from(hex) silently drops invalid characters, and timingSafeEqual
  // throws on a length mismatch, so the format is checked first.
  if (!signature || !HEX_SHA256.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
