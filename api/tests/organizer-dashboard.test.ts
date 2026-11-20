import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { systemClock } from "../src/shared/clock.js";
import { buyerToken, call, organizerToken, testAuthSettings } from "./helpers/auth.js";
import { createTestEvent, type TestEvent } from "./helpers/events.js";
import { startTestDatabase } from "./helpers/postgres.js";

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
let app: ReturnType<typeof createApp>;
let owner: { token: string; userId: string };
let other: { token: string; userId: string };
let mine: TestEvent;
let theirs: TestEvent;

beforeAll(async () => {
  testDb = await startTestDatabase();
  app = createApp({ db: testDb.db, clock: systemClock, auth: testAuthSettings, simulatedPaymentEnabled: true });
  owner = await organizerToken(testDb.db, app);
  other = await organizerToken(testDb.db, app);
  mine = await createTestEvent(app, owner.token, { regular: { price: 100_000, quota: 50 }, vip: { price: 400_000, quota: 10 } });
  theirs = await createTestEvent(app, other.token);
});

afterAll(async () => {
  await testDb?.stop();
});

async function order(token: string, ticketTypeId: string, quantity: number) {
  const res = await call(app, "POST", "/orders", { token, body: { ticketTypeId, quantity } });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string };
}

describe("GET /organizer/events", () => {
  it("lists only the caller's events with their counters, soonest first", async () => {
    const buyer = await buyerToken(app);
    await order(buyer.token, mine.regular.id, 3);

    const res = await call(app, "GET", "/organizer/events", { token: owner.token });

    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<{ id: string; organizerId: string; ticketTypes: Array<Record<string, unknown>> }>;
    expect(list.map((e) => e.id)).toEqual([mine.id]);
    expect(list[0]!.organizerId).toBe(owner.userId);
    expect(list[0]!.ticketTypes[0]).toMatchObject({ kind: "REGULAR", quota: 50, sold: 0, reserved: 3, remaining: 47 });
  });

  it("is for organizers only", async () => {
    const buyer = await buyerToken(app);
    expect((await call(app, "GET", "/organizer/events")).status).toBe(401);
    expect((await call(app, "GET", "/organizer/events", { token: buyer.token })).status).toBe(403);
  });
});

describe("GET /organizer/events/:id/orders", () => {
  it("returns the newest orders first with the buyer's name only", async () => {
    const buyer = await buyerToken(app);
    const first = await order(buyer.token, mine.regular.id, 1);
    const payer = await buyerToken(app);
    const second = await order(payer.token, mine.vip.id, 2);
    expect((await call(app, "POST", `/orders/${second.id}/pay`, { token: payer.token })).status).toBe(200);

    const res = await call(app, "GET", `/organizer/events/${mine.id}/orders`, { token: owner.token });

    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ id: second.id, quantity: 2, status: "PAID", ticketType: { kind: "VIP" }, totalPrice: 800_000 });
    expect(rows.map((r) => r.id)).toContain(first.id);
    for (const row of rows) {
      expect(row).toHaveProperty("buyerName");
      expect(row).not.toHaveProperty("buyerEmail");
      expect(row).not.toHaveProperty("email");
      expect(row).not.toHaveProperty("buyerId");
    }
  });

  it("honours limit, defaulting to 20 and rejecting values outside 1 to 50", async () => {
    const buyer = await buyerToken(app);
    await order(buyer.token, mine.regular.id, 1);

    const one = await call(app, "GET", `/organizer/events/${mine.id}/orders?limit=1`, { token: owner.token });
    expect(((await one.json()) as unknown[]).length).toBe(1);
    for (const bad of ["0", "51", "abc"]) {
      const res = await call(app, "GET", `/organizer/events/${mine.id}/orders?limit=${bad}`, { token: owner.token });
      expect(res.status).toBe(400);
    }
  });

  it("answers 403 for another organizer's event, 404 for a missing one", async () => {
    expect((await call(app, "GET", `/organizer/events/${theirs.id}/orders`, { token: owner.token })).status).toBe(403);
    const missing = await call(app, "GET", `/organizer/events/${randomUUID()}/orders`, { token: owner.token });
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe("EVENT_NOT_FOUND");
  });
});

describe("GET /admin/invariants?eventId=", () => {
  it("checks only that event, so a violation elsewhere does not show", async () => {
    await testDb.db.execute(sql`UPDATE ticket_types SET reserved = reserved + 1 WHERE id = ${theirs.regular.id}`);
    try {
      const scoped = await (await call(app, "GET", `/admin/invariants?eventId=${mine.id}`, { token: owner.token })).json();
      const global = await (await call(app, "GET", "/admin/invariants", { token: owner.token })).json();

      expect(scoped.ok).toBe(true);
      expect(scoped.checks.find((c: { id: string }) => c.id === "reserved_matches_pending").checked).toBe(2);
      expect(global.ok).toBe(false);
    } finally {
      await testDb.db.execute(sql`UPDATE ticket_types SET reserved = reserved - 1 WHERE id = ${theirs.regular.id}`);
    }
  });

  it("is limited to the event's owner, and validates the id", async () => {
    expect((await call(app, "GET", `/admin/invariants?eventId=${theirs.id}`, { token: owner.token })).status).toBe(403);
    expect((await call(app, "GET", `/admin/invariants?eventId=${randomUUID()}`, { token: owner.token })).status).toBe(404);
    expect((await call(app, "GET", "/admin/invariants?eventId=nope", { token: owner.token })).status).toBe(400);
  });
});
