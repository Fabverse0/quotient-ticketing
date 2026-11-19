import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { orders } from "../src/shared/db/schema.js";
import { buyerToken, call, organizerToken, testAuthSettings } from "./helpers/auth.js";
import { createTestEvent, type TestEvent } from "./helpers/events.js";
import { createFakeClock } from "./helpers/fake-clock.js";
import { startTestDatabase } from "./helpers/postgres.js";

const HOLD_MS = 15 * 60 * 1000;

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
let app: ReturnType<typeof createApp>;
let productionApp: ReturnType<typeof createApp>;
let organizer: { token: string; userId: string };
const clock = createFakeClock(new Date());

beforeAll(async () => {
  testDb = await startTestDatabase();
  const deps = { db: testDb.db, clock, auth: testAuthSettings };
  app = createApp({ ...deps, simulatedPaymentEnabled: true });
  productionApp = createApp({ ...deps, simulatedPaymentEnabled: false });
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

async function placeOrder(quantity: number) {
  const res = await call(app, "POST", "/orders", {
    token: buyer.token,
    body: { ticketTypeId: event.vip.id, quantity },
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string };
}

const pay = (target: typeof app, token: string, orderId: string) =>
  call(target, "POST", `/orders/${orderId}/pay`, { token });

async function statusOf(orderId: string) {
  const [row] = await testDb.db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
  return row!.status;
}

describe("POST /orders/:id/pay", () => {
  it("pays the buyer's order and returns it with its tickets", async () => {
    const order = await placeOrder(2);

    const res = await pay(app, buyer.token, order.id);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: order.id, status: "PAID", quantity: 2, ticketType: { kind: "VIP" } });
    expect(body.tickets).toHaveLength(2);
    expect(body.tickets[0]).toEqual({
      id: expect.any(String),
      seq: 1,
      code: expect.any(String),
      issuedAt: expect.any(String),
    });
  });

  it("answers a second payment with the same order and tickets", async () => {
    const order = await placeOrder(1);
    const first = await (await pay(app, buyer.token, order.id)).json();

    const res = await pay(app, buyer.token, order.id);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(first);
  });

  it("rejects an expired order with 409 ORDER_EXPIRED", async () => {
    const order = await placeOrder(1);
    clock.advance(HOLD_MS + 1);

    const res = await pay(app, buyer.token, order.id);

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("ORDER_EXPIRED");
    expect(await statusOf(order.id)).toBe("PENDING");
  });

  it("rejects a cancelled order with 409 ORDER_NOT_PENDING", async () => {
    const order = await placeOrder(1);
    await call(app, "POST", `/orders/${order.id}/cancel`, { token: buyer.token });

    const res = await pay(app, buyer.token, order.id);

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("ORDER_NOT_PENDING");
  });

  it("hides another buyer's order behind 404 ORDER_NOT_FOUND", async () => {
    const order = await placeOrder(1);
    const stranger = await buyerToken(app);

    const res = await pay(app, stranger.token, order.id);

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("ORDER_NOT_FOUND");
    expect(await statusOf(order.id)).toBe("PENDING");
  });

  it("requires a buyer token and a uuid id", async () => {
    const order = await placeOrder(1);

    expect((await call(app, "POST", `/orders/${order.id}/pay`)).status).toBe(401);
    expect((await pay(app, organizer.token, order.id)).status).toBe(403);
    const invalid = await pay(app, buyer.token, "not-a-uuid");
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("does not exist when simulated payment is disabled (production)", async () => {
    const order = await placeOrder(1);

    const res = await pay(productionApp, buyer.token, order.id);

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
    expect(await statusOf(order.id)).toBe("PENDING");
  });
});
