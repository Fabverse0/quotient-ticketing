import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createPaymentsService } from "../src/modules/payments/service.js";
import { orders, tickets, ticketTypes } from "../src/shared/db/schema.js";
import { buyerToken, call, organizerToken, testAuthSettings } from "./helpers/auth.js";
import { createTestEvent, type TestEvent } from "./helpers/events.js";
import { createFakeClock } from "./helpers/fake-clock.js";
import { raceBehindLock } from "./helpers/locks.js";
import { startTestDatabase } from "./helpers/postgres.js";

const HOLD_MS = 15 * 60 * 1000;

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
let app: ReturnType<typeof createApp>;
let payments: ReturnType<typeof createPaymentsService>;
let organizer: { token: string; userId: string };
const clock = createFakeClock(new Date());

beforeAll(async () => {
  testDb = await startTestDatabase();
  app = createApp({ db: testDb.db, clock, auth: testAuthSettings });
  payments = createPaymentsService({ db: testDb.db, clock });
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
    body: { ticketTypeId: event.regular.id, quantity },
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string };
}

async function counters() {
  const [row] = await testDb.db.select().from(ticketTypes).where(eq(ticketTypes.id, event.regular.id));
  return { reserved: row!.reserved, sold: row!.sold };
}

async function orderRow(orderId: string) {
  const [row] = await testDb.db.select().from(orders).where(eq(orders.id, orderId));
  return row!;
}

async function ticketsOf(orderId: string) {
  return testDb.db.select().from(tickets).where(eq(tickets.orderId, orderId));
}

const lockOrderRow = (orderId: string) => sql`SELECT 1 FROM orders WHERE id = ${orderId} FOR UPDATE`;

describe("markOrderPaid through the buyer payment path", () => {
  it("marks a PENDING order PAID, issues one ticket per seat and moves reserved to sold", async () => {
    const order = await placeOrder(3);
    clock.advance(60_000);

    const paid = await payments.payAsBuyer(buyer.userId, order.id);

    expect(paid.status).toBe("PAID");
    expect(new Date(paid.paidAt!).getTime()).toBe(clock.now().getTime());
    expect(paid.tickets.map((t) => t.seq)).toEqual([1, 2, 3]);
    const codes = paid.tickets.map((t) => t.code);
    expect(new Set(codes).size).toBe(3);
    for (const code of codes) expect(code).toMatch(/^[A-Za-z0-9_-]{16}$/);

    expect(await counters()).toEqual({ reserved: 0, sold: 3 });
    expect(await ticketsOf(order.id)).toHaveLength(3);
  });

  it("rejects an order past expires_at even before the sweeper runs, leaving the quota alone", async () => {
    const order = await placeOrder(2);
    clock.advance(HOLD_MS);

    await expect(payments.payAsBuyer(buyer.userId, order.id)).rejects.toMatchObject({
      status: 409,
      code: "ORDER_EXPIRED",
    });
    expect((await orderRow(order.id)).status).toBe("PENDING");
    expect(await counters()).toEqual({ reserved: 2, sold: 0 });
    expect(await ticketsOf(order.id)).toHaveLength(0);
  });

  it("returns the same tickets when an already PAID order is paid again", async () => {
    const order = await placeOrder(2);
    const first = await payments.payAsBuyer(buyer.userId, order.id);

    const second = await payments.payAsBuyer(buyer.userId, order.id);

    expect(second.status).toBe("PAID");
    expect(second.tickets).toEqual(first.tickets);
    expect(await counters()).toEqual({ reserved: 0, sold: 2 });
    expect(await ticketsOf(order.id)).toHaveLength(2);
  });

  it("treats another buyer's order like a missing one", async () => {
    const order = await placeOrder(1);
    const stranger = await buyerToken(app);

    await expect(payments.payAsBuyer(stranger.userId, order.id)).rejects.toMatchObject({
      status: 404,
      code: "ORDER_NOT_FOUND",
    });
    await expect(payments.payAsBuyer(buyer.userId, crypto.randomUUID())).rejects.toMatchObject({
      status: 404,
      code: "ORDER_NOT_FOUND",
    });
    expect((await orderRow(order.id)).status).toBe("PENDING");
  });

  it("refuses to pay a cancelled order", async () => {
    const order = await placeOrder(2);
    expect((await call(app, "POST", `/orders/${order.id}/cancel`, { token: buyer.token })).status).toBe(200);

    await expect(payments.payAsBuyer(buyer.userId, order.id)).rejects.toMatchObject({
      status: 409,
      code: "ORDER_NOT_PENDING",
    });
    expect(await counters()).toEqual({ reserved: 0, sold: 0 });
    expect(await ticketsOf(order.id)).toHaveLength(0);
  });
});

describe("markOrderPaid under concurrency", () => {
  it("lets exactly one of a simultaneous pay and cancel win, with consistent counters", async () => {
    const order = await placeOrder(2);

    const [pay, cancel] = await raceBehindLock<unknown>(testDb.db, lockOrderRow(order.id), [
      () => payments.payAsBuyer(buyer.userId, order.id),
      async () => (await call(app, "POST", `/orders/${order.id}/cancel`, { token: buyer.token })).status,
    ]);

    const status = (await orderRow(order.id)).status;
    if (status === "PAID") {
      expect(pay!.status).toBe("fulfilled");
      expect(cancel).toEqual({ status: "fulfilled", value: 409 });
      expect(await counters()).toEqual({ reserved: 0, sold: 2 });
      expect(await ticketsOf(order.id)).toHaveLength(2);
    } else {
      expect(status).toBe("CANCELLED");
      expect(cancel).toEqual({ status: "fulfilled", value: 200 });
      expect(pay).toMatchObject({ status: "rejected", reason: { code: "ORDER_NOT_PENDING" } });
      expect(await counters()).toEqual({ reserved: 0, sold: 0 });
      expect(await ticketsOf(order.id)).toHaveLength(0);
    }
  });

  it("issues tickets only once when the same order is paid in parallel", async () => {
    const order = await placeOrder(3);

    const results = await raceBehindLock(
      testDb.db,
      lockOrderRow(order.id),
      [1, 2, 3].map(() => () => payments.payAsBuyer(buyer.userId, order.id)),
    );

    // Every caller gets the paid order back; none sees an error.
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled", "fulfilled"]);
    const codeSets = results.map((r) => (r.status === "fulfilled" ? r.value.tickets.map((t) => t.code) : []));
    expect(codeSets[1]).toEqual(codeSets[0]);
    expect(codeSets[2]).toEqual(codeSets[0]);
    expect(await ticketsOf(order.id)).toHaveLength(3);
    expect(await counters()).toEqual({ reserved: 0, sold: 3 });
  });
});
