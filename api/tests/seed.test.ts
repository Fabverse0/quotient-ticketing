import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { seedOrganizer } from "../src/modules/auth/seed.js";
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

const login = (email: string, password: string) =>
  app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

const countByEmail = async (email: string) =>
  (await testDb.db.select().from(users).where(eq(users.email, email))).length;

describe("seedOrganizer", () => {
  it("creates the organizer, who can log in with the organizer role", async () => {
    const email = "organizer@quotient.test";
    expect(await seedOrganizer(testDb.db, { email, password: "organizer-pass" })).toBe("created");

    const res = await login(email, "organizer-pass");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(await verifyToken(body.token, secret)).toEqual({ userId: body.user.id, role: "organizer" });
  });

  it("is idempotent: running it again keeps one account and its original password", async () => {
    const email = "idempotent@quotient.test";
    expect(await seedOrganizer(testDb.db, { email, password: "first-password" })).toBe("created");
    expect(await seedOrganizer(testDb.db, { email, password: "second-password" })).toBe("exists");

    expect(await countByEmail(email)).toBe(1);
    expect((await login(email, "first-password")).status).toBe(200);
    expect((await login(email, "second-password")).status).toBe(401);
  });

  it("creates exactly one account when two seeders run at once", async () => {
    const email = "concurrent@quotient.test";
    const results = await Promise.all([
      seedOrganizer(testDb.db, { email, password: "organizer-pass" }),
      seedOrganizer(testDb.db, { email, password: "organizer-pass" }),
    ]);

    expect(results.sort()).toEqual(["created", "exists"]);
    expect(await countByEmail(email)).toBe(1);
  });

  it("refuses to seed an email that already belongs to a buyer", async () => {
    const email = "buyer-first@quotient.test";
    await app.request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "correct-horse", name: "Buyer" }),
    });

    await expect(seedOrganizer(testDb.db, { email, password: "organizer-pass" })).rejects.toThrow(/buyer/);
  });
});
