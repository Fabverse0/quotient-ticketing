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
  app = createApp({ db: testDb.db, clock, auth: testAuthSettings, simulatedPaymentEnabled: true });
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

async function paidOrder(token: string, ticketTypeId: string, quantity: number) {
  const placed = await call(app, "POST", "/orders", { token, body: { ticketTypeId, quantity } });
  expect(placed.status).toBe(201);
  const { id } = await placed.json();
  const paid = await call(app, "POST", `/orders/${id}/pay`, { token });
  expect(paid.status).toBe(200);
  return paid.json();
}

describe("GET /tickets", () => {
  it("lists the buyer's tickets with their event and ticket type, newest order first", async () => {
    const first = await paidOrder(buyer.token, event.regular.id, 1);
    clock.advance(60_000);
    const second = await paidOrder(buyer.token, event.vip.id, 2);

    const res = await call(app, "GET", "/tickets", { token: buyer.token });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((t: { code: string }) => t.code)).toEqual([
      second.tickets[0].code,
      second.tickets[1].code,
      first.tickets[0].code,
    ]);
    expect(body[0]).toEqual({
      id: second.tickets[0].id,
      seq: 1,
      code: second.tickets[0].code,
      issuedAt: second.tickets[0].issuedAt,
      orderId: second.id,
      event: { id: event.id, title: "Test Event", venue: "Test Hall", startsAt: event.startsAt },
      ticketType: { id: event.vip.id, kind: "VIP" },
    });
  });

  it("never shows another buyer's tickets", async () => {
    const stranger = await buyerToken(app);
    await paidOrder(stranger.token, event.regular.id, 2);

    const res = await call(app, "GET", "/tickets", { token: buyer.token });

    expect(await res.json()).toEqual([]);
  });

  it("is for buyers only", async () => {
    expect((await call(app, "GET", "/tickets")).status).toBe(401);
    expect((await call(app, "GET", "/tickets", { token: organizer.token })).status).toBe(403);
  });
});

describe("GET /orders/:id for a paid order", () => {
  it("includes the issued tickets in seq order", async () => {
    const paid = await paidOrder(buyer.token, event.regular.id, 3);

    const res = await call(app, "GET", `/orders/${paid.id}`, { token: buyer.token });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(paid);
    expect(body.tickets.map((t: { seq: number }) => t.seq)).toEqual([1, 2, 3]);
  });
});
