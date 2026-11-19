import { randomBytes } from "node:crypto";

// 96 random bits as 16 base64url characters: not sequential and not guessable.
// tickets_code_unique still rejects the (negligible) chance of a repeat.
export function generateTicketCode(): string {
  return randomBytes(12).toString("base64url");
}
