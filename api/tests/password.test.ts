import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/modules/auth/password.js";

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong horse battery", hash)).toBe(false);
  });

  it("does not store the plaintext and salts every hash", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toContain("same-password");
    expect(a).toMatch(/^\$2[aby]\$/);
    expect(a).not.toBe(b);
  });
});
