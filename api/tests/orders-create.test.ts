import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { withCapacityGuard } from "../src/modules/orders/capacity-guard.js";
import { orders, ticketTypes } from "../src/shared/db/schema.js";
import { AppError } from "../src/shared/errors.js";
import { buyerToken, call, organizerToken, testAuthSettings } from "./helpers/auth.js";
import { createTestEvent } from "./helpers/events.js";
import { createFakeClock } from "./helpers/fake-clock.js";
import { startTestDatabase } from "./helpers/postgres.js";

const HOLD_MS = 15 * 60 * 1000;

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
let app: ReturnType<typeof createApp>;
let organizer: { token: string; userId: string };
// Tokens are signed with this clock but verified against real time, so it
// starts at real "now" and is reset before each test.
const clock = createFakeClock(new Date());

beforeAll(async () => {
  testDb = await startTestDatabase();
  app = createApp({ db: testDb.db, clock, auth: testAuthSettings });
  organizer = await organizerToken(testDb.db, app);
});

afterAll(async () => {
  await testDb?.stop();
});

beforeEach(() => {
  clock.set(new Date());
});

const placeOrder = (token: string, body: unknown) => call(app, "POST", "/orders", { token, body });

async function reservedOf(ticketTypeId: string) {
  const [row] = await testDb.db.select().from(ticketTypes).where(eq(ticketTypes.id, ticketTypeId));
  return row!.reserved;
}

async function pendingQuantityOf(ticketTypeId: string) {
  const [row] = await testDb.db
    .select({ total: sql<number>`coalesce(sum(${orders.quantity}), 0)::int` })
    .from(orders)
    .where(and(eq(orders.ticketTypeId, ticketTypeId), eq(orders.status, "PENDING")));
  return row!.total;
}

describe("POST /orders", () => {
  it("creates a PENDING order that holds the quota for exactly 15 minutes", async () => {
    const event = await createTestEvent(app, organizer.token, { regular: { price: 150_000, quota: 10 } });
    const buyer = await buyerToken(app);

    const res = await placeOrder(buyer.token, { ticketTypeId: event.regular.id, quantity: 3 });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      status: "PENDING",
      quantity: 3,
      totalPrice: 450_000,
      createdAt: clock.now().toISOString(),
      expiresAt: new Date(clock.now().getTime() + HOLD_MS).toISOString(),
      event: { id: event.id, title: "Test Event", startsAt: event.startsAt },
      ticketType: { id: event.regular.id, kind: "REGULAR" },
    });
    expect(await reservedOf(event.regular.id)).toBe(3);
  });

  it("rejects with QUOTA_EXHAUSTED when the remaining quota is too small", async () => {
    const event = await createTestEvent(app, organizer.token, { regular: { price: 50_000, quota: 2 } });
    const first = await buyerToken(app);
    const second = await buyerToken(app);

    expect((await placeOrder(first.token, { ticketTypeId: event.regular.id, quantity: 2 })).status).toBe(201);
    const res = await placeOrder(second.token, { ticketTypeId: event.regular.id, quantity: 1 });

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("QUOTA_EXHAUSTED");
    expect(await reservedOf(event.regular.id)).toBe(2);
    const secondOrders = await testDb.db.select().from(orders).where(eq(orders.buyerId, second.userId));
    expect(secondOrders).toHaveLength(0);
  });

  it("counts both ticket types of one event toward the 4-ticket limit", async () => {
    const event = await createTestEvent(app, organizer.token);
    const buyer = await buyerToken(app);

    expect((await placeOrder(buyer.token, { ticketTypeId: event.regular.id, quantity: 3 })).status).toBe(201);
    const over = await placeOrder(buyer.token, { ticketTypeId: event.vip.id, quantity: 2 });

    expect(over.status).toBe(409);
    expect((await over.json()).error.code).toBe("BUYER_LIMIT_EXCEEDED");
    expect(await reservedOf(event.vip.id)).toBe(0);
    expect((await placeOrder(buyer.token, { ticketTypeId: event.vip.id, quantity: 1 })).status).toBe(201);
  });

  it("applies the limit per event, not across events", async () => {
    const first = await createTestEvent(app, organizer.token);
    const second = await createTestEvent(app, organizer.token);
    const buyer = await buyerToken(app);

    expect((await placeOrder(buyer.token, { ticketTypeId: first.regular.id, quantity: 4 })).status).toBe(201);
    expect((await placeOrder(buyer.token, { ticketTypeId: second.regular.id, quantity: 4 })).status).toBe(201);
  });

  it("counts PAID orders and ignores CANCELLED ones", async () => {
    const event = await createTestEvent(app, organizer.token);
    const buyer = await buyerToken(app);
    const paid = await (await placeOrder(buyer.token, { ticketTypeId: event.regular.id, quantity: 2 })).json();
    const cancelled = await (await placeOrder(buyer.token, { ticketTypeId: event.regular.id, quantity: 2 })).json();
    await testDb.db.update(orders).set({ status: "PAID", paidAt: clock.now() }).where(eq(orders.id, paid.id));
    await testDb.db
      .update(orders)
      .set({ status: "CANCELLED", cancelledAt: clock.now() })
      .where(eq(orders.id, cancelled.id));

    expect((await placeOrder(buyer.token, { ticketTypeId: event.regular.id, quantity: 2 })).status).toBe(201);
    const over = await placeOrder(buyer.token, { ticketTypeId: event.regular.id, quantity: 1 });
    expect((await over.json()).error.code).toBe("BUYER_LIMIT_EXCEEDED");
  });

  it("still counts a PENDING order past expires_at until it is expired", async () => {
    const event = await createTestEvent(app, organizer.token);
    const buyer = await buyerToken(app);
    expect((await placeOrder(buyer.token, { ticketTypeId: event.regular.id, quantity: 4 })).status).toBe(201);

    clock.advance(HOLD_MS + 1000);
    const res = await placeOrder(buyer.token, { ticketTypeId: event.regular.id, quantity: 1 });

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("BUYER_LIMIT_EXCEEDED");
  });

  it("lets only enough concurrent requests from one buyer through to reach the limit", async () => {
    const event = await createTestEvent(app, organizer.token);
    const buyer = await buyerToken(app);

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => placeOrder(buyer.token, { ticketTypeId: event.regular.id, quantity: 2 })),
    );

    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(2);
    expect(statuses.filter((s) => s === 409)).toHaveLength(8);
    const rejected = await Promise.all(responses.filter((r) => r.status === 409).map((r) => r.json()));
    expect(rejected.every((b) => b.error.code === "BUYER_LIMIT_EXCEEDED")).toBe(true);
    expect(await pendingQuantityOf(event.regular.id)).toBe(4);
    expect(await reservedOf(event.regular.id)).toBe(4);
  });

  it("never reserves more than the quota under many concurrent orders", async () => {
    const event = await createTestEvent(app, organizer.token, { regular: { price: 10_000, quota: 5 } });
    const buyers = await Promise.all(Array.from({ length: 20 }, () => buyerToken(app)));

    const responses = await Promise.all(
      buyers.map((b) => placeOrder(b.token, { ticketTypeId: event.regular.id, quantity: 1 })),
    );

    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(5);
    const rejected = await Promise.all(responses.filter((r) => r.status !== 201).map((r) => r.json()));
    expect(rejected).toHaveLength(15);
    expect(rejected.every((b) => b.error.code === "QUOTA_EXHAUSTED")).toBe(true);
    expect(await reservedOf(event.regular.id)).toBe(5);
    expect(await pendingQuantityOf(event.regular.id)).toBe(5);
  });

  it("rejects an event that starts exactly now with EVENT_ALREADY_STARTED", async () => {
    const startsAt = new Date(clock.now().getTime() + 60_000);
    const event = await createTestEvent(app, organizer.token, { startsAt });
    const buyer = await buyerToken(app);

    clock.set(startsAt);
    const res = await placeOrder(buyer.token, { ticketTypeId: event.regular.id, quantity: 1 });

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("EVENT_ALREADY_STARTED");
    expect(await reservedOf(event.regular.id)).toBe(0);
  });

  it("returns 404 for an unknown ticket type", async () => {
    const buyer = await buyerToken(app);
    const res = await placeOrder(buyer.token, { ticketTypeId: "00000000-0000-4000-8000-000000000000", quantity: 1 });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("TICKET_TYPE_NOT_FOUND");
  });

  it.each([0, 5, 1.5, "2"])("rejects quantity %s with VALIDATION_ERROR", async (quantity) => {
    const event = await createTestEvent(app, organizer.token);
    const buyer = await buyerToken(app);
    const res = await placeOrder(buyer.token, { ticketTypeId: event.regular.id, quantity });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a ticketTypeId that is not a uuid", async () => {
    const buyer = await buyerToken(app);
    const res = await placeOrder(buyer.token, { ticketTypeId: "abc", quantity: 1 });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("forbids organizers from ordering", async () => {
    const event = await createTestEvent(app, organizer.token);
    const res = await placeOrder(organizer.token, { ticketTypeId: event.regular.id, quantity: 1 });
    expect(res.status).toBe(403);
  });

  it("requires a token", async () => {
    const res = await call(app, "POST", "/orders", { body: { ticketTypeId: "x", quantity: 1 } });
    expect(res.status).toBe(401);
  });
});

describe("withCapacityGuard", () => {
  it("turns a ticket_types_capacity violation into 409 QUOTA_EXHAUSTED and logs it as an error", async () => {
    const event = await createTestEvent(app, organizer.token, { regular: { price: 10_000, quota: 1 } });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const attempt = withCapacityGuard(() =>
      testDb.db.execute(sql`UPDATE ticket_types SET reserved = quota + 1 WHERE id = ${event.regular.id}`),
    );

    await expect(attempt).rejects.toMatchObject({ status: 409, code: "QUOTA_EXHAUSTED" });
    expect(logged).toHaveBeenCalledWith("capacity guard triggered", expect.anything());
    logged.mockRestore();
  });

  it("rethrows other constraint violations unchanged", async () => {
    const event = await createTestEvent(app, organizer.token);

    const attempt = withCapacityGuard(() =>
      testDb.db.execute(sql`UPDATE ticket_types SET reserved = -1 WHERE id = ${event.regular.id}`),
    );

    await expect(attempt).rejects.toSatisfy((err) => !(err instanceof AppError));
  });
});

