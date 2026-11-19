import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { buyerToken, call, organizerToken, testAuthSettings } from "./helpers/auth.js";
import { createTestEvent, type TestEvent } from "./helpers/events.js";
import { createFakeClock } from "./helpers/fake-clock.js";
import { startTestDatabase } from "./helpers/postgres.js";

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

async function placeOrder(token: string, ticketTypeId = event.regular.id) {
  const res = await call(app, "POST", "/orders", { token, body: { ticketTypeId, quantity: 1 } });
  expect(res.status).toBe(201);
  return res.json();
}

describe("GET /orders", () => {
  it("lists only the buyer's own orders, newest first", async () => {
    // Registered before the clock moves ahead: a token whose iat lies in the
    // future is rejected.
    const stranger = await buyerToken(app);
    const first = await placeOrder(buyer.token);
    clock.advance(1000);
    const second = await placeOrder(buyer.token, event.vip.id);
    clock.advance(1000);
    const third = await placeOrder(buyer.token);
    await placeOrder(stranger.token);

    const res = await call(app, "GET", "/orders", { token: buyer.token });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((o: { id: string }) => o.id)).toEqual([third.id, second.id, first.id]);
    expect(body[1]).toEqual(second);
  });

  it("includes orders that are no longer pending, with their status", async () => {
    const order = await placeOrder(buyer.token);
    await call(app, "POST", `/orders/${order.id}/cancel`, { token: buyer.token });

    const body = await (await call(app, "GET", "/orders", { token: buyer.token })).json();

    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: order.id, status: "CANCELLED" });
  });

  it("returns an empty list for a buyer without orders", async () => {
    const res = await call(app, "GET", "/orders", { token: buyer.token });
    expect(await res.json()).toEqual([]);
  });

  it("forbids organizers", async () => {
    expect((await call(app, "GET", "/orders", { token: organizer.token })).status).toBe(403);
  });
});

describe("GET /orders/:id", () => {
  it("returns the buyer's own order with an empty ticket list while unpaid", async () => {
    const order = await placeOrder(buyer.token);

    const res = await call(app, "GET", `/orders/${order.id}`, { token: buyer.token });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...order, tickets: [] });
  });

  it("returns 404 for another buyer's order, as if it did not exist", async () => {
    const order = await placeOrder(buyer.token);
    const stranger = await buyerToken(app);

    const res = await call(app, "GET", `/orders/${order.id}`, { token: stranger.token });

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("ORDER_NOT_FOUND");
  });

  it("returns 404 for an unknown order", async () => {
    const res = await call(app, "GET", "/orders/00000000-0000-4000-8000-000000000000", { token: buyer.token });
    expect(res.status).toBe(404);
  });

  it("rejects an id that is not a uuid", async () => {
    const res = await call(app, "GET", "/orders/abc", { token: buyer.token });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });
});
