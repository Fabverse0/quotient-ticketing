import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { orders, ticketTypes } from "../src/shared/db/schema.js";
import { buyerToken, call, organizerToken, testAuthSettings } from "./helpers/auth.js";
import { createTestEvent, type TestEvent } from "./helpers/events.js";
import { createFakeClock } from "./helpers/fake-clock.js";
import { startTestDatabase } from "./helpers/postgres.js";

const HOLD_MS = 15 * 60 * 1000;

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
let app: ReturnType<typeof createApp>;
let organizer: { token: string; userId: string };
const clock = createFakeClock(new Date());

beforeAll(async () => {
  testDb = await startTestDatabase();
  app = createApp({ db: testDb.db, clock, auth: testAuthSettings });
  organizer = await organizerToken(testDb.db, app);
});

afterAll(async () => {
  await testDb?.stop();
});

let event: TestEvent;
let buyer: { token: string; userId: string };

beforeEach(async () => {
  clock.set(new Date());
  event = await createTestEvent(app, organizer.token);
  buyer = await buyerToken(app);
});

async function placeOrder(token: string, quantity: number) {
  const res = await call(app, "POST", "/orders", { token, body: { ticketTypeId: event.regular.id, quantity } });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string };
}

const cancel = (token: string, orderId: string) => call(app, "POST", `/orders/${orderId}/cancel`, { token });

async function reservedOf(ticketTypeId: string) {
  const [row] = await testDb.db.select().from(ticketTypes).where(eq(ticketTypes.id, ticketTypeId));
  return row!.reserved;
}

async function statusOf(orderId: string) {
  const [row] = await testDb.db.select().from(orders).where(eq(orders.id, orderId));
  return row!.status;
}

describe("POST /orders/:id/cancel", () => {
  it("cancels a PENDING order and returns its quota immediately", async () => {
    const order = await placeOrder(buyer.token, 3);
    clock.advance(60_000);

    const res = await cancel(buyer.token, order.id);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: order.id,
      status: "CANCELLED",
      cancelledAt: clock.now().toISOString(),
    });
    expect(await reservedOf(event.regular.id)).toBe(0);
  });

  it("rejects a second cancel with ORDER_NOT_PENDING and returns the quota only once", async () => {
    const order = await placeOrder(buyer.token, 2);
    await cancel(buyer.token, order.id);

    const again = await cancel(buyer.token, order.id);

    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe("ORDER_NOT_PENDING");
    expect(await reservedOf(event.regular.id)).toBe(0);
  });

  it("lets exactly one of several concurrent cancels win", async () => {
    await placeOrder(buyer.token, 1);
    const order = await placeOrder(buyer.token, 2);

    const responses = await Promise.all(Array.from({ length: 5 }, () => cancel(buyer.token, order.id)));

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409, 409, 409, 409]);
    expect(await reservedOf(event.regular.id)).toBe(1);
  });

  it("frees the buyer's limit for that event", async () => {
    const order = await placeOrder(buyer.token, 4);
    await cancel(buyer.token, order.id);

    await placeOrder(buyer.token, 4);
  });

  it("rejects an order past expires_at with ORDER_EXPIRED and leaves it for the sweeper", async () => {
    const order = await placeOrder(buyer.token, 2);
    clock.advance(HOLD_MS);

    const res = await cancel(buyer.token, order.id);

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("ORDER_EXPIRED");
    expect(await statusOf(order.id)).toBe("PENDING");
    expect(await reservedOf(event.regular.id)).toBe(2);
  });

  it("returns 404 for another buyer's order and leaves it untouched", async () => {
    const order = await placeOrder(buyer.token, 1);
    const stranger = await buyerToken(app);

    const res = await cancel(stranger.token, order.id);

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("ORDER_NOT_FOUND");
    expect(await statusOf(order.id)).toBe("PENDING");
    expect(await reservedOf(event.regular.id)).toBe(1);
  });

  it("returns 404 for an unknown order", async () => {
    const res = await cancel(buyer.token, "00000000-0000-4000-8000-000000000000");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("ORDER_NOT_FOUND");
  });

  it("rejects an id that is not a uuid", async () => {
    const res = await cancel(buyer.token, "abc");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("forbids organizers", async () => {
    const order = await placeOrder(buyer.token, 1);
    expect((await cancel(organizer.token, order.id)).status).toBe(403);
  });
});
