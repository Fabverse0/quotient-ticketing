import { sign } from "hono/jwt";
import { describe, expect, it } from "vitest";
import { issueToken, verifyToken } from "../src/modules/auth/token.js";

const secret = "a-test-secret-that-is-at-least-32-chars";
const userId = "6f1c2f3e-5a43-4a42-9d0e-2a1f1d6c9b11";

const issue = (now = new Date(), expiresInSeconds = 3600) =>
  issueToken({ userId, role: "buyer" }, { secret, expiresInSeconds, now });

describe("token service", () => {
  it("round-trips user_id and role", async () => {
    const token = await issue();
    expect(await verifyToken(token, secret)).toEqual({ userId, role: "buyer" });
  });

  it("puts user_id and role in the payload", async () => {
    const [, payload] = (await issue()).split(".");
    const claims = JSON.parse(Buffer.from(payload!, "base64url").toString());
    expect(claims).toMatchObject({ user_id: userId, role: "buyer" });
    expect(claims.exp - claims.iat).toBe(3600);
  });

  it("rejects an expired token", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600_000);
    expect(await verifyToken(await issue(twoHoursAgo, 3600), secret)).toBeNull();
  });

  it("rejects a token signed with another secret", async () => {
    const token = await issue();
    expect(await verifyToken(token, "another-secret-that-is-at-least-32-chars")).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const [header, , signature] = (await issue()).split(".");
    const forged = Buffer.from(
      JSON.stringify({ user_id: userId, role: "organizer", exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString("base64url");
    expect(await verifyToken(`${header}.${forged}.${signature}`, secret)).toBeNull();
  });

  it("rejects a token without an expiry", async () => {
    const token = await sign({ user_id: userId, role: "buyer" }, secret, "HS256");
    expect(await verifyToken(token, secret)).toBeNull();
  });

  it("rejects a token with an unknown role", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = await sign({ user_id: userId, role: "admin", exp }, secret, "HS256");
    expect(await verifyToken(token, secret)).toBeNull();
  });

  it("rejects garbage", async () => {
    expect(await verifyToken("not.a.jwt", secret)).toBeNull();
    expect(await verifyToken("", secret)).toBeNull();
  });
});
