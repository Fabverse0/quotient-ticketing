import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { orders, ticketTypes } from "../src/shared/db/schema.js";
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

beforeEach(() => {
  clock.set(new Date());
});

const placeOrder = (token: string, body: unknown, key?: string) =>
  call(app, "POST", "/orders", { token, body, ...(key !== undefined ? { headers: { "Idempotency-Key": key } } : {}) });

async function reservedOf(ticketTypeId: string) {
  const [row] = await testDb.db.select().from(ticketTypes).where(eq(ticketTypes.id, ticketTypeId));
  return row!.reserved;
}

const ordersOf = (buyerId: string) => testDb.db.select().from(orders).where(eq(orders.buyerId, buyerId));

describe("POST /orders with Idempotency-Key", () => {
  let event: TestEvent;
  beforeEach(async () => {
    event = await createTestEvent(app, organizer.token);
  });

  it("replays the same order with 200 and reserves the quota only once", async () => {
    const buyer = await buyerToken(app);
    const key = randomUUID();
    const body = { ticketTypeId: event.regular.id, quantity: 2 };

    const first = await placeOrder(buyer.token, body, key);
    const second = await placeOrder(buyer.token, body, key);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
    expect(await ordersOf(buyer.userId)).toHaveLength(1);
    expect(await reservedOf(event.regular.id)).toBe(2);
  });

  it("treats a body with the same values in a different key order as the same request", async () => {
    const buyer = await buyerToken(app);
    const key = randomUUID();

    const first = await placeOrder(buyer.token, { ticketTypeId: event.regular.id, quantity: 1 }, key);
    const second = await placeOrder(buyer.token, { quantity: 1, ticketTypeId: event.regular.id }, key);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
  });

  it("rejects the same key with a different body as IDEMPOTENCY_KEY_REUSED", async () => {
    const buyer = await buyerToken(app);
    const key = randomUUID();

    await placeOrder(buyer.token, { ticketTypeId: event.regular.id, quantity: 1 }, key);
    const reused = await placeOrder(buyer.token, { ticketTypeId: event.regular.id, quantity: 2 }, key);

    expect(reused.status).toBe(422);
    expect((await reused.json()).error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(await reservedOf(event.regular.id)).toBe(1);
  });

  it("creates exactly one order when the same request arrives several times at once", async () => {
    const buyer = await buyerToken(app);
    const key = randomUUID();
    const body = { ticketTypeId: event.regular.id, quantity: 1 };

    const responses = await Promise.all(Array.from({ length: 5 }, () => placeOrder(buyer.token, body, key)));

    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 200, 200, 200, 201]);
    const ids = new Set((await Promise.all(responses.map((r) => r.json()))).map((b) => b.id));
    expect(ids.size).toBe(1);
    expect(await reservedOf(event.regular.id)).toBe(1);
  });

  it("scopes keys per buyer", async () => {
    const first = await buyerToken(app);
    const second = await buyerToken(app);
    const key = randomUUID();
    const body = { ticketTypeId: event.regular.id, quantity: 1 };

    const a = await placeOrder(first.token, body, key);
    const b = await placeOrder(second.token, body, key);

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect((await a.json()).id).not.toBe((await b.json()).id);
  });

  it("replays the original order even after the event has started", async () => {
    const startsAt = new Date(clock.now().getTime() + 60_000);
    const soon = await createTestEvent(app, organizer.token, { startsAt });
    const buyer = await buyerToken(app);
    const key = randomUUID();
    const body = { ticketTypeId: soon.regular.id, quantity: 1 };
    const first = await placeOrder(buyer.token, body, key);

    clock.set(startsAt);
    const replay = await placeOrder(buyer.token, body, key);

    expect(replay.status).toBe(200);
    expect((await replay.json()).id).toBe((await first.json()).id);
  });

  it("does not store the key when the request fails, so a retry is processed again", async () => {
    const small = await createTestEvent(app, organizer.token, { regular: { price: 10_000, quota: 1 } });
    const buyer = await buyerToken(app);
    const key = randomUUID();
    const body = { ticketTypeId: small.regular.id, quantity: 2 };

    const failed = await placeOrder(buyer.token, body, key);
    await testDb.db.update(ticketTypes).set({ quota: 2 }).where(eq(ticketTypes.id, small.regular.id));
    const retried = await placeOrder(buyer.token, body, key);

    expect(failed.status).toBe(409);
    expect(retried.status).toBe(201);
  });

  it.each(["", "x".repeat(256)])("rejects an invalid key (length %#) with VALIDATION_ERROR", async (key) => {
    const buyer = await buyerToken(app);
    const res = await placeOrder(buyer.token, { ticketTypeId: event.regular.id, quantity: 1 }, key);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(/Idempotency-Key/);
  });
});
