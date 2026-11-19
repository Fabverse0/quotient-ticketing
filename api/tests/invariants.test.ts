import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createInvariantsService, type InvariantReport } from "../src/modules/invariants/service.js";
import { systemClock } from "../src/shared/clock.js";
import { buyerToken, call, organizerToken, testAuthSettings } from "./helpers/auth.js";
import { createTestEvent, type TestEvent } from "./helpers/events.js";
import { startTestDatabase } from "./helpers/postgres.js";

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
let app: ReturnType<typeof createApp>;
let organizer: { token: string; userId: string };

beforeAll(async () => {
  testDb = await startTestDatabase();
  app = createApp({ db: testDb.db, clock: systemClock, auth: testAuthSettings, simulatedPaymentEnabled: true });
  organizer = await organizerToken(testDb.db, app);
});

afterAll(async () => {
  await testDb?.stop();
});

// The report covers every event, so each test leaves the database consistent.
afterEach(async () => {
  await testDb.db.execute(sql`TRUNCATE orders, tickets, idempotency_keys, processed_events`);
  await testDb.db.execute(sql`UPDATE ticket_types SET sold = 0, reserved = 0`);
});

const check = () => createInvariantsService({ db: testDb.db }).check();

function find(report: InvariantReport, id: string) {
  const found = report.checks.find((c) => c.id === id);
  if (!found) throw new Error(`no check ${id}`);
  return found;
}

const regularOf = (event: TestEvent) => ({ eventId: event.id, ticketTypeId: event.regular.id, kind: "REGULAR" });

async function placeOrder(token: string, ticketTypeId: string, quantity: number, onApp = app) {
  const res = await call(onApp, "POST", "/orders", { token, body: { ticketTypeId, quantity } });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string };
}

const CHECK_IDS = [
  "reserved_matches_pending",
  "sold_matches_paid",
  "tickets_match_sold",
  "counters_within_quota",
  "orders_within_quota",
  "buyer_limit",
];

describe("invariant checks", () => {
  it("reports every check OK, with the compared totals, after normal activity", async () => {
    const event = await createTestEvent(app, organizer.token, { regular: { price: 10_000, quota: 10 } });
    const buyer = await buyerToken(app);
    const paid = await placeOrder(buyer.token, event.regular.id, 2);
    expect((await call(app, "POST", `/orders/${paid.id}/pay`, { token: buyer.token })).status).toBe(200);
    const cancelled = await placeOrder(buyer.token, event.regular.id, 1);
    await call(app, "POST", `/orders/${cancelled.id}/cancel`, { token: buyer.token });
    await placeOrder(buyer.token, event.vip.id, 1);

    const report = await check();

    expect(report.ok).toBe(true);
    expect(report.checks.map((c) => [c.id, c.ok])).toEqual(CHECK_IDS.map((id) => [id, true]));
    expect(find(report, "reserved_matches_pending").values).toEqual({ reserved: 1, pendingQuantity: 1 });
    expect(find(report, "sold_matches_paid").values).toEqual({ sold: 2, paidQuantity: 2 });
    expect(find(report, "tickets_match_sold").values).toEqual({ tickets: 2, sold: 2 });
    expect(find(report, "buyer_limit").values).toEqual({ maxActiveQuantity: 3, limit: 4 });
  });

  it("shows a naive lost update as LANGGAR for reserved and for orders over quota", async () => {
    const naive = createApp({
      db: testDb.db,
      clock: systemClock,
      auth: testAuthSettings,
      quotaStrategy: "naive",
      naiveRaceDelayMs: 300,
    });
    const event = await createTestEvent(naive, organizer.token, { regular: { price: 10_000, quota: 1 } });
    const [a, b] = [await buyerToken(naive), await buyerToken(naive)];
    await Promise.all([placeOrder(a.token, event.regular.id, 1, naive), placeOrder(b.token, event.regular.id, 1, naive)]);

    const report = await check();

    expect(report.ok).toBe(false);
    expect(find(report, "reserved_matches_pending")).toMatchObject({
      ok: false,
      violations: [{ subject: regularOf(event), values: { reserved: 1, pendingQuantity: 2 } }],
    });
    expect(find(report, "orders_within_quota")).toMatchObject({
      ok: false,
      violations: [{ subject: regularOf(event), values: { activeQuantity: 2, quota: 1 } }],
    });
    // The counters alone still look valid, which is why the CHECK never fires.
    expect(find(report, "counters_within_quota").ok).toBe(true);
  });

  it("catches sold drifting away from PAID orders and their tickets", async () => {
    const event = await createTestEvent(app, organizer.token);
    const buyer = await buyerToken(app);
    const order = await placeOrder(buyer.token, event.regular.id, 2);
    await call(app, "POST", `/orders/${order.id}/pay`, { token: buyer.token });
    await testDb.db.execute(sql`UPDATE ticket_types SET sold = sold + 1 WHERE id = ${event.regular.id}`);

    const report = await check();

    expect(find(report, "sold_matches_paid").violations).toEqual([
      { subject: regularOf(event), values: { sold: 3, paidQuantity: 2 } },
    ]);
    expect(find(report, "tickets_match_sold").violations).toEqual([
      { subject: regularOf(event), values: { tickets: 2, sold: 3 } },
    ]);
  });

  it("catches a missing ticket on its own", async () => {
    const event = await createTestEvent(app, organizer.token);
    const buyer = await buyerToken(app);
    const order = await placeOrder(buyer.token, event.regular.id, 2);
    await call(app, "POST", `/orders/${order.id}/pay`, { token: buyer.token });
    await testDb.db.execute(sql`DELETE FROM tickets WHERE order_id = ${order.id} AND seq = 2`);

    const report = await check();

    expect(report.checks.filter((c) => !c.ok).map((c) => c.id)).toEqual(["tickets_match_sold"]);
    expect(find(report, "tickets_match_sold").violations[0]!.values).toEqual({ tickets: 1, sold: 2 });
  });

  it("catches counters over quota when the CHECK constraint is not there to stop them", async () => {
    const event = await createTestEvent(app, organizer.token, { regular: { price: 10_000, quota: 5 } });
    await testDb.db.execute(sql`ALTER TABLE ticket_types DROP CONSTRAINT ticket_types_capacity`);
    try {
      await testDb.db.execute(sql`UPDATE ticket_types SET reserved = 6 WHERE id = ${event.regular.id}`);

      const report = await check();

      expect(find(report, "counters_within_quota").violations).toEqual([
        { subject: regularOf(event), values: { soldPlusReserved: 6, quota: 5 } },
      ]);
    } finally {
      await testDb.db.execute(sql`UPDATE ticket_types SET reserved = 0 WHERE id = ${event.regular.id}`);
      await testDb.db.execute(
        sql`ALTER TABLE ticket_types ADD CONSTRAINT ticket_types_capacity CHECK (sold + reserved <= quota)`,
      );
    }
  });

  it("catches a buyer holding more than 4 active tickets for one event", async () => {
    const event = await createTestEvent(app, organizer.token);
    const buyer = await buyerToken(app);
    const order = await placeOrder(buyer.token, event.regular.id, 4);
    // Bypasses the advisory lock and the limit check, as a bug would.
    await testDb.db.execute(sql`
      INSERT INTO orders (buyer_id, event_id, ticket_type_id, quantity, status, total_price, expires_at, created_at)
      SELECT buyer_id, event_id, ticket_type_id, 1, 'PENDING', total_price / 4, expires_at, created_at
      FROM orders WHERE id = ${order.id}
    `);
    await testDb.db.execute(sql`UPDATE ticket_types SET reserved = reserved + 1 WHERE id = ${event.regular.id}`);

    const report = await check();

    expect(report.checks.filter((c) => !c.ok).map((c) => c.id)).toEqual(["buyer_limit"]);
    expect(find(report, "buyer_limit").violations).toEqual([
      { subject: { buyerId: buyer.userId, eventId: event.id }, values: { activeQuantity: 5, limit: 4 } },
    ]);
  });
});

describe("GET /admin/invariants", () => {
  it("returns the same report to an organizer", async () => {
    const event = await createTestEvent(app, organizer.token);
    const buyer = await buyerToken(app);
    await placeOrder(buyer.token, event.regular.id, 1);

    const res = await call(app, "GET", "/admin/invariants", { token: organizer.token });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(await check());
  });

  it("is for organizers only", async () => {
    const buyer = await buyerToken(app);
    expect((await call(app, "GET", "/admin/invariants")).status).toBe(401);
    expect((await call(app, "GET", "/admin/invariants", { token: buyer.token })).status).toBe(403);
  });
});
