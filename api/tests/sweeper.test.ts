import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { sweepExpiredOrders } from "../src/jobs/sweeper.js";
import { orders, tickets, ticketTypes } from "../src/shared/db/schema.js";
import { buyerToken, call, organizerToken, testAuthSettings } from "./helpers/auth.js";
import { createTestEvent, type TestEvent } from "./helpers/events.js";
import { createFakeClock } from "./helpers/fake-clock.js";
import { stageBehindLock } from "./helpers/locks.js";
import { startTestDatabase } from "./helpers/postgres.js";

const HOLD_MS = 15 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const QUOTA = 50;

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
let app: ReturnType<typeof createApp>;
let organizer: { token: string; userId: string };
const clock = createFakeClock(new Date());

beforeAll(async () => {
  testDb = await startTestDatabase();
  app = createApp({ db: testDb.db, clock, auth: testAuthSettings, simulatedPaymentEnabled: true });
  organizer = await organizerToken(testDb.db, app);
});

afterAll(async () => {
  await testDb?.stop();
});

let event: TestEvent;
let buyer: { token: string; userId: string };

beforeEach(async () => {
  // Earlier tests leave PENDING orders behind; close them so sweep counts are exact.
  await testDb.db.execute(sql`UPDATE orders SET status = 'CANCELLED', cancelled_at = now() WHERE status = 'PENDING'`);
  clock.set(new Date());
  event = await createTestEvent(app, organizer.token, { regular: { price: 100_000, quota: QUOTA } });
  buyer = await buyerToken(app);
});

async function placeOrder(quantity: number, token = buyer.token) {
  const res = await call(app, "POST", "/orders", { token, body: { ticketTypeId: event.regular.id, quantity } });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string };
}

async function counters() {
  const [row] = await testDb.db.select().from(ticketTypes).where(eq(ticketTypes.id, event.regular.id));
  return { reserved: row!.reserved, sold: row!.sold };
}

async function status(orderId: string) {
  const [row] = await testDb.db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
  return row!.status;
}

const later = (ms: number) => new Date(clock.now().getTime() + ms);
const lockTicketType = () => sql`SELECT 1 FROM ticket_types WHERE id = ${event.regular.id} FOR UPDATE`;

async function act(method: "pay" | "cancel", orderId: string) {
  const res = await call(app, "POST", `/orders/${orderId}/${method}`, { token: buyer.token });
  return { status: res.status, body: await res.json() };
}

describe("an unpaid order after 15 minutes", () => {
  it("becomes EXPIRED and gives its quota back, end to end", async () => {
    const order = await placeOrder(2);
    const remaining = async () => {
      const body = await (await call(app, "GET", `/events/${event.id}`)).json();
      return body.ticketTypes.find((t: { kind: string }) => t.kind === "REGULAR").remaining;
    };
    expect(await remaining()).toBe(QUOTA - 2);

    clock.advance(HOLD_MS);
    expect(await sweepExpiredOrders(testDb.db, clock.now())).toBe(1);

    const detail = await (await call(app, "GET", `/orders/${order.id}`, { token: buyer.token })).json();
    expect(detail).toMatchObject({ status: "EXPIRED", expiredAt: clock.now().toISOString(), tickets: [] });
    expect(await remaining()).toBe(QUOTA);
    expect(await counters()).toEqual({ reserved: 0, sold: 0 });
  });

  it("no longer counts toward the 4-ticket limit", async () => {
    await placeOrder(4);
    clock.advance(HOLD_MS);
    await sweepExpiredOrders(testDb.db, clock.now());

    await placeOrder(4);
  });
});

describe("sweepExpiredOrders", () => {
  it("leaves an order alone until expires_at, then expires it exactly at expires_at", async () => {
    const order = await placeOrder(1);

    expect(await sweepExpiredOrders(testDb.db, later(HOLD_MS - 1))).toBe(0);
    expect(await status(order.id)).toBe("PENDING");
    expect(await counters()).toEqual({ reserved: 1, sold: 0 });

    expect(await sweepExpiredOrders(testDb.db, later(HOLD_MS))).toBe(1);
    expect(await status(order.id)).toBe("EXPIRED");
    expect(await counters()).toEqual({ reserved: 0, sold: 0 });
  });

  it("never touches PAID or CANCELLED orders past expires_at", async () => {
    const paid = await placeOrder(2);
    expect((await call(app, "POST", `/orders/${paid.id}/pay`, { token: buyer.token })).status).toBe(200);
    const cancelled = await placeOrder(1);
    expect((await call(app, "POST", `/orders/${cancelled.id}/cancel`, { token: buyer.token })).status).toBe(200);

    expect(await sweepExpiredOrders(testDb.db, later(HOLD_MS))).toBe(0);

    expect(await status(paid.id)).toBe("PAID");
    expect(await status(cancelled.id)).toBe("CANCELLED");
    expect(await counters()).toEqual({ reserved: 0, sold: 2 });
  });

  it("works through every due order in batches", async () => {
    const buyers = [buyer, await buyerToken(app), await buyerToken(app)];
    for (const { token } of buyers) {
      await placeOrder(1, token);
      await placeOrder(1, token);
    }
    expect(await counters()).toEqual({ reserved: 6, sold: 0 });

    expect(await sweepExpiredOrders(testDb.db, later(HOLD_MS), 4)).toBe(6);
    expect(await counters()).toEqual({ reserved: 0, sold: 0 });
  });

  it("skips an order another transaction holds instead of waiting for it", async () => {
    const order = await placeOrder(2);

    const { during } = await stageBehindLock(
      testDb.db,
      sql`SELECT 1 FROM orders WHERE id = ${order.id} FOR UPDATE`,
      [],
      () => sweepExpiredOrders(testDb.db, later(HOLD_MS)),
    );

    expect(during).toBe(0);
    expect(await status(order.id)).toBe("PENDING");
    expect(await sweepExpiredOrders(testDb.db, later(HOLD_MS))).toBe(1);
    expect(await counters()).toEqual({ reserved: 0, sold: 0 });
  });
});

describe("sweepExpiredOrders under concurrency", () => {
  it("returns the quota once when two sweepers run at the same time", async () => {
    await placeOrder(1);
    await placeOrder(1);
    clock.advance(5 * MINUTE_MS);
    // Not due yet, so a double release shows as a wrong number, not a CHECK error.
    await placeOrder(2);
    const due = later(HOLD_MS - 5 * MINUTE_MS);

    const { blocked, during } = await stageBehindLock(
      testDb.db,
      lockTicketType(),
      [() => sweepExpiredOrders(testDb.db, due)],
      () => sweepExpiredOrders(testDb.db, due),
    );

    expect(blocked).toEqual([{ status: "fulfilled", value: 2 }]);
    expect(during).toBe(0);
    expect(await counters()).toEqual({ reserved: 2, sold: 0 });
  });

  it("lets a payment that holds the order win while the sweep skips it", async () => {
    const order = await placeOrder(2);
    clock.advance(HOLD_MS - MINUTE_MS);

    const { blocked, during } = await stageBehindLock(
      testDb.db,
      lockTicketType(),
      [() => act("pay", order.id)],
      () => sweepExpiredOrders(testDb.db, later(MINUTE_MS)),
    );

    expect(during).toBe(0);
    expect(blocked[0]).toMatchObject({ status: "fulfilled", value: { status: 200 } });
    expect(await status(order.id)).toBe("PAID");
    expect(await counters()).toEqual({ reserved: 0, sold: 2 });
    expect(await testDb.db.select().from(tickets).where(eq(tickets.orderId, order.id))).toHaveLength(2);
  });

  it.each([
    ["pay", 409, "ORDER_EXPIRED"],
    ["cancel", 409, "ORDER_NOT_PENDING"],
  ] as const)("makes a %s that waits behind a sweep find the order expired", async (method, code, error) => {
    const order = await placeOrder(2);
    clock.advance(HOLD_MS - MINUTE_MS);

    const { blocked } = await stageBehindLock(testDb.db, lockTicketType(), [
      () => sweepExpiredOrders(testDb.db, later(MINUTE_MS)),
      () => act(method, order.id),
    ]);

    expect(blocked[0]).toEqual({ status: "fulfilled", value: 1 });
    expect(blocked[1]).toMatchObject({ status: "fulfilled", value: { status: code, body: { error: { code: error } } } });
    expect(await status(order.id)).toBe("EXPIRED");
    expect(await counters()).toEqual({ reserved: 0, sold: 0 });
    expect(await testDb.db.select().from(tickets).where(eq(tickets.orderId, order.id))).toHaveLength(0);
  });
});
