import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { sweepExpiredOrders } from "../src/jobs/sweeper.js";
import { listPaidSales } from "../src/modules/events/queries.js";
import { buyerToken, call, organizerToken, testAuthSettings } from "./helpers/auth.js";
import { createTestEvent, type TestEvent } from "./helpers/events.js";
import { createFakeClock } from "./helpers/fake-clock.js";
import { startTestDatabase } from "./helpers/postgres.js";

const MINUTE_MS = 60 * 1000;
const HOLD_MS = 15 * MINUTE_MS;

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
let app: ReturnType<typeof createApp>;
let owner: { token: string; userId: string };
let other: { token: string; userId: string };
let bystander: { token: string; userId: string };
let event: TestEvent;
let firstPaymentAt: Date;
const clock = createFakeClock(new Date());

async function order(token: string, ticketTypeId: string, quantity: number) {
  const res = await call(app, "POST", "/orders", { token, body: { ticketTypeId, quantity } });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function act(method: "pay" | "cancel", token: string, orderId: string) {
  expect((await call(app, "POST", `/orders/${orderId}/${method}`, { token })).status).toBe(200);
}

// One event with an order in four of the five statuses, paid a minute apart.
beforeAll(async () => {
  testDb = await startTestDatabase();
  app = createApp({ db: testDb.db, clock, auth: testAuthSettings, simulatedPaymentEnabled: true });
  owner = await organizerToken(testDb.db, app);
  other = await organizerToken(testDb.db, app);
  bystander = await buyerToken(app);
  event = await createTestEvent(app, owner.token);
  const [b1, b2, b3, b4, b5] = await Promise.all([1, 2, 3, 4, 5].map(() => buyerToken(app)));

  const paidRegular = await order(b1!.token, event.regular.id, 2);
  clock.advance(MINUTE_MS);
  firstPaymentAt = clock.now();
  await act("pay", b1!.token, paidRegular);

  const paidVip = await order(b2!.token, event.vip.id, 1);
  clock.advance(MINUTE_MS);
  await act("pay", b2!.token, paidVip);

  await act("cancel", b3!.token, await order(b3!.token, event.regular.id, 1));

  await order(b4!.token, event.regular.id, 3);
  clock.advance(HOLD_MS + MINUTE_MS);
  await sweepExpiredOrders(testDb.db, clock.now());

  await order(b5!.token, event.regular.id, 1);
});

afterAll(async () => {
  await testDb?.stop();
});

const analytics = (id: string, token?: string) => call(app, "GET", `/organizer/events/${id}/analytics`, { token });

describe("GET /organizer/events/:id/analytics", () => {
  it("counts orders and seats in every status, with the empty ones present as zero", async () => {
    const res = await analytics(event.id, owner.token);

    expect(res.status).toBe(200);
    const { statuses } = await res.json();
    expect(statuses).toEqual([
      { status: "PENDING", orders: 1, quantity: 1 },
      { status: "PAID", orders: 2, quantity: 3 },
      { status: "CANCELLED", orders: 1, quantity: 1 },
      { status: "EXPIRED", orders: 1, quantity: 3 },
      { status: "REFUND_REQUIRED", orders: 0, quantity: 0 },
    ]);
  });

  it("lists the paid sales oldest first with their ticket kind, and nothing unpaid", async () => {
    const { sales } = await (await analytics(event.id, owner.token)).json();

    expect(sales).toEqual([
      { at: firstPaymentAt.toISOString(), kind: "REGULAR", quantity: 2 },
      { at: new Date(firstPaymentAt.getTime() + MINUTE_MS).toISOString(), kind: "VIP", quantity: 1 },
    ]);
  });

  it("keeps the newest sales when there are more than the limit, still oldest first", async () => {
    const sales = await listPaidSales(testDb.db, event.id, 1);

    expect(sales).toEqual([{ at: new Date(firstPaymentAt.getTime() + MINUTE_MS).toISOString(), kind: "VIP", quantity: 1 }]);
  });

  it("returns empty lists for an event with no orders", async () => {
    const empty = await createTestEvent(app, owner.token);

    const body = await (await analytics(empty.id, owner.token)).json();

    expect(body.sales).toEqual([]);
    expect(body.statuses.map((s: { orders: number }) => s.orders)).toEqual([0, 0, 0, 0, 0]);
  });

  it("is only for the owner: another organizer gets 403, an unknown event 404, a bad id 400", async () => {
    expect((await analytics(event.id, other.token)).status).toBe(403);
    expect((await analytics(randomUUID(), owner.token)).status).toBe(404);
    expect((await analytics("not-a-uuid", owner.token)).status).toBe(400);
  });

  it("is for organizers only", async () => {
    expect((await analytics(event.id)).status).toBe(401);
    expect((await analytics(event.id, bystander.token)).status).toBe(403);
  });
});
