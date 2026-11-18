import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireAuth, requireRole, type AuthEnv } from "../src/modules/auth/middleware.js";
import { issueToken, type Role } from "../src/modules/auth/token.js";
import { registerErrorHandling } from "../src/shared/errors.js";

const secret = "a-test-secret-that-is-at-least-32-chars";
const userId = "6f1c2f3e-5a43-4a42-9d0e-2a1f1d6c9b11";

function buildApp() {
  const app = new Hono<AuthEnv>();
  app.get("/me", requireAuth(secret), (c) => c.json(c.get("auth")));
  app.get("/organizer-only", requireAuth(secret), requireRole("organizer"), (c) => c.json({ ok: true }));
  app.get("/buyer-only", requireAuth(secret), requireRole("buyer"), (c) => c.json({ ok: true }));
  app.get("/misconfigured", requireRole("organizer"), (c) => c.json({ ok: true }));
  registerErrorHandling(app);
  return app;
}

const tokenFor = (role: Role, now = new Date()) =>
  issueToken({ userId, role }, { secret, expiresInSeconds: 3600, now });

const bearer = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

describe("requireAuth", () => {
  it("rejects a request without a token", async () => {
    const res = await buildApp().request("/me");
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a non-bearer scheme", async () => {
    const res = await buildApp().request("/me", { headers: { Authorization: `Basic ${await tokenFor("buyer")}` } });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a garbage token", async () => {
    const res = await buildApp().request("/me", bearer("not-a-real-token"));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("INVALID_TOKEN");
  });

  it("rejects an expired token", async () => {
    const expired = await tokenFor("buyer", new Date(Date.now() - 2 * 3600_000));
    const res = await buildApp().request("/me", bearer(expired));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("INVALID_TOKEN");
  });

  it("accepts a valid token and exposes user_id and role to the handler", async () => {
    const res = await buildApp().request("/me", bearer(await tokenFor("buyer")));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId, role: "buyer" });
  });
});

describe("requireRole", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a buyer on an organizer route with 403", async () => {
    const res = await buildApp().request("/organizer-only", bearer(await tokenFor("buyer")));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
  });

  it("lets an organizer through", async () => {
    const res = await buildApp().request("/organizer-only", bearer(await tokenFor("organizer")));
    expect(res.status).toBe(200);
  });

  it("rejects an organizer on a buyer route", async () => {
    const res = await buildApp().request("/buyer-only", bearer(await tokenFor("organizer")));
    expect(res.status).toBe(403);
  });

  it("answers 401 before 403 when there is no token", async () => {
    const res = await buildApp().request("/organizer-only");
    expect(res.status).toBe(401);
  });

  it("fails loudly when used without requireAuth", async () => {
    const res = await buildApp().request("/misconfigured");
    expect(res.status).toBe(500);
  });
});
