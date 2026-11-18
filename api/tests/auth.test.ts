import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { verifyToken } from "../src/modules/auth/token.js";
import { systemClock } from "../src/shared/clock.js";
import { users } from "../src/shared/db/schema.js";
import { startTestDatabase } from "./helpers/postgres.js";

const secret = "a-test-secret-that-is-at-least-32-chars";

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  testDb = await startTestDatabase();
  app = createApp({ db: testDb.db, clock: systemClock, auth: { secret, expiresInSeconds: 3600 } });
});

afterAll(async () => {
  await testDb?.stop();
});

const post = (path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const validRegistration = (email: string) => ({ email, password: "correct-horse", name: "Budi" });

describe("POST /auth/register", () => {
  it("creates a buyer and returns a token carrying user_id and role", async () => {
    const res = await post("/auth/register", validRegistration("budi@example.com"));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user).toMatchObject({ email: "budi@example.com", name: "Budi", role: "buyer" });
    expect(body.user).not.toHaveProperty("passwordHash");
    expect(await verifyToken(body.token, secret)).toEqual({ userId: body.user.id, role: "buyer" });
  });

  it("stores a bcrypt hash, never the plaintext password", async () => {
    await post("/auth/register", validRegistration("hash-check@example.com"));
    const [row] = await testDb.db.select().from(users).where(eq(users.email, "hash-check@example.com"));
    expect(row?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(row?.passwordHash).not.toContain("correct-horse");
  });

  it("ignores a role sent by the client: registration only creates buyers", async () => {
    const res = await post("/auth/register", { ...validRegistration("sneaky@example.com"), role: "organizer" });
    expect(res.status).toBe(201);
    expect((await res.json()).user.role).toBe("buyer");
  });

  it("rejects a duplicate email regardless of letter case", async () => {
    await post("/auth/register", validRegistration("dupe@example.com"));
    const res = await post("/auth/register", validRegistration("DUPE@Example.com"));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("EMAIL_TAKEN");
  });

  it("lets only one of two concurrent registrations for the same email win", async () => {
    const results = await Promise.all([
      post("/auth/register", validRegistration("race@example.com")),
      post("/auth/register", validRegistration("race@example.com")),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it.each([
    ["an invalid email", { email: "not-an-email", password: "correct-horse", name: "Budi" }, "email"],
    ["a short password", { email: "short@example.com", password: "abc", name: "Budi" }, "password"],
    ["a password over 72 bytes", { email: "long@example.com", password: "x".repeat(73), name: "Budi" }, "password"],
    ["a missing name", { email: "noname@example.com", password: "correct-horse" }, "name"],
  ])("rejects %s with VALIDATION_ERROR", async (_label, payload, field) => {
    const res = await post("/auth/register", payload);
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toContain(field);
  });

  it("rejects a body that is not JSON", async () => {
    const res = await post("/auth/register", "{not json");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_JSON");
  });
});

describe("POST /auth/login", () => {
  beforeAll(async () => {
    await post("/auth/register", validRegistration("login@example.com"));
  });

  it("returns a token for the right credentials", async () => {
    const res = await post("/auth/login", { email: "login@example.com", password: "correct-horse" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(await verifyToken(body.token, secret)).toEqual({ userId: body.user.id, role: "buyer" });
  });

  it("matches the email without regard to letter case", async () => {
    const res = await post("/auth/login", { email: "LOGIN@example.com", password: "correct-horse" });
    expect(res.status).toBe(200);
  });

  it("rejects a wrong password", async () => {
    const res = await post("/auth/login", { email: "login@example.com", password: "wrong-password" });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("INVALID_CREDENTIALS");
  });

  it("answers an unknown email exactly like a wrong password", async () => {
    const wrongPassword = await post("/auth/login", { email: "login@example.com", password: "wrong-password" });
    const unknownEmail = await post("/auth/login", { email: "ghost@example.com", password: "wrong-password" });

    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(await unknownEmail.json()).toEqual(await wrongPassword.json());
  });

  it("rejects a malformed payload", async () => {
    const res = await post("/auth/login", { email: "login@example.com" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });
});
