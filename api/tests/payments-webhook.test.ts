import { createHmac, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { orders, processedEvents, tickets, ticketTypes } from "../src/shared/db/schema.js";
import { buyerToken, call, organizerToken, testAuthSettings } from "./helpers/auth.js";
import { createTestEvent, type TestEvent } from "./helpers/events.js";
import { createFakeClock } from "./helpers/fake-clock.js";
import { fulfilledValues, raceBehindLock } from "./helpers/locks.js";
import { startTestDatabase } from "./helpers/postgres.js";
import { expireOrder } from "./helpers/sweeper.js";

const HOLD_MS = 15 * 60 * 1000;
const WEBHOOK_SECRET = "a-webhook-secret-that-is-32-chars-long";
const PRICE = 150_000;

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
let app: ReturnType<typeof createApp>;
let organizer: { token: string; userId: string };
const clock = createFakeClock(new Date());

beforeAll(async () => {
  testDb = await startTestDatabase();
  app = createApp({ db: testDb.db, clock, auth: testAuthSettings, paymentWebhookSecret: WEBHOOK_SECRET });
  organizer = await organizerToken(testDb.db, app);
});

afterAll(async () => {
  await testDb?.stop();
});

let event: TestEvent;
let buyer: { token: string; userId: string };

beforeEach(async () => {
  clock.set(new Date());
  event = await createTestEvent(app, organizer.token, { regular: { price: PRICE, quota: 50 } });
  buyer = await buyerToken(app);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function placeOrder(quantity: number, token = buyer.token) {
  const res = await call(app, "POST", "/orders", { token, body: { ticketTypeId: event.regular.id, quantity } });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; totalPrice: number };
}

// Computed independently of the production code, as a provider would.
const sign = (body: string, secret = WEBHOOK_SECRET) => createHmac("sha256", secret).update(body).digest("hex");

function sendRaw(body: string, signature: string | undefined) {
  return app.request("/webhooks/payment", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(signature !== undefined ? { "X-Signature": signature } : {}) },
    body,
  });
}

function succeeded(order: { id: string; totalPrice: number }, overrides: Record<string, unknown> = {}) {
  return {
    event_id: `evt_${randomUUID()}`,
    event_type: "payment.succeeded",
    order_id: order.id,
    amount: order.totalPrice,
    ...overrides,
  };
}

function send(payload: object) {
  const body = JSON.stringify(payload);
  return sendRaw(body, sign(body));
}

async function counters() {
  const [row] = await testDb.db.select().from(ticketTypes).where(eq(ticketTypes.id, event.regular.id));
  return { reserved: row!.reserved, sold: row!.sold };
}

async function orderRow(orderId: string) {
  const [row] = await testDb.db.select().from(orders).where(eq(orders.id, orderId));
  return row!;
}

const ticketCount = async (orderId: string) =>
  (await testDb.db.select().from(tickets).where(eq(tickets.orderId, orderId))).length;

async function recorded(eventId: string) {
  return testDb.db.select().from(processedEvents).where(eq(processedEvents.eventId, eventId));
}

describe("POST /webhooks/payment signature", () => {
  it("rejects a missing, malformed, or wrong signature with 401 and records nothing", async () => {
    const order = await placeOrder(1);
    const payload = succeeded(order);
    const body = JSON.stringify(payload);
    const tampered = JSON.stringify({ ...payload, amount: 1 });

    const attempts = [
      sendRaw(body, undefined),
      sendRaw(body, "not-hex"),
      sendRaw(body, sign(body).slice(0, 63)),
      sendRaw(body, sign(body, "another-secret-that-is-also-32-chars")),
      sendRaw(tampered, sign(body)),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe("INVALID_SIGNATURE");
    }
    expect(await recorded(payload.event_id)).toHaveLength(0);
    expect((await orderRow(order.id)).status).toBe("PENDING");
  });

  it("verifies the exact raw bytes and accepts an uppercase hex signature", async () => {
    const order = await placeOrder(1);
    const body = `{ "event_id": "evt_${randomUUID()}", "event_type": "payment.succeeded",
      "order_id": "${order.id}", "amount": ${order.totalPrice} }`;

    const res = await sendRaw(body, sign(body).toUpperCase());

    expect(res.status).toBe(200);
    expect((await orderRow(order.id)).status).toBe("PAID");
  });

  it("refuses a body over 64 KB with 413 before checking the signature", async () => {
    const order = await placeOrder(1);
    const payload = succeeded(order, { padding: "x".repeat(64 * 1024) });

    const res = await send(payload);

    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("PAYLOAD_TOO_LARGE");
    expect(await recorded(payload.event_id)).toHaveLength(0);
  });

  it("rejects invalid JSON or an invalid payload with 400 without recording it", async () => {
    const invalidJson = "{not json";
    const invalidJsonRes = await sendRaw(invalidJson, sign(invalidJson));
    expect(invalidJsonRes.status).toBe(400);
    expect((await invalidJsonRes.json()).error.code).toBe("INVALID_JSON");

    const invalid = [
      { event_type: "payment.succeeded", order_id: randomUUID(), amount: 1 },
      { event_id: "evt_bad", event_type: 42 },
      { event_id: "evt_bad", event_type: "payment.succeeded", order_id: "x", amount: -1 },
    ];
    for (const payload of invalid) {
      const res = await send(payload);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    }
    expect(await recorded("evt_bad")).toHaveLength(0);
  });
});

describe("POST /webhooks/payment unknown event types", () => {
  it("records an unknown event type as IGNORED and leaves the order alone", async () => {
    const order = await placeOrder(2);
    const payload = succeeded(order, { event_type: "payment.refunded" });

    const res = await send(payload);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, duplicate: false, outcome: "IGNORED" });
    expect((await orderRow(order.id)).status).toBe("PENDING");
    expect(await counters()).toEqual({ reserved: 2, sold: 0 });
    const [row] = await recorded(payload.event_id);
    expect(row).toMatchObject({ eventType: "payment.refunded", orderId: null, outcome: "IGNORED", payload });
  });

  it("needs only event_id and event_type for an unknown type", async () => {
    const payload = { event_id: `evt_${randomUUID()}`, event_type: "customer.created" };

    const res = await send(payload);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, duplicate: false, outcome: "IGNORED" });
    expect((await recorded(payload.event_id))[0]).toMatchObject({ outcome: "IGNORED", payload });
  });
});

describe("POST /webhooks/payment payment.succeeded", () => {
  it("marks the order PAID and issues its tickets", async () => {
    const order = await placeOrder(3);
    const payload = succeeded(order);

    const res = await send(payload);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, duplicate: false, outcome: "PAID" });
    expect((await orderRow(order.id)).status).toBe("PAID");
    expect(await ticketCount(order.id)).toBe(3);
    expect(await counters()).toEqual({ reserved: 0, sold: 3 });
    const [row] = await recorded(payload.event_id);
    expect(row).toMatchObject({ eventType: "payment.succeeded", orderId: order.id, outcome: "PAID", payload });
  });

  it("processes a repeated event only once and answers the repeat with 200", async () => {
    const order = await placeOrder(2);
    const payload = succeeded(order);
    await send(payload);

    const res = await send(payload);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, duplicate: true, outcome: "PAID" });
    expect(await ticketCount(order.id)).toBe(2);
    expect(await counters()).toEqual({ reserved: 0, sold: 2 });
    expect(await recorded(payload.event_id)).toHaveLength(1);
  });

  it("keeps the first outcome but warns when a repeated event_id carries a different payload", async () => {
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    const order = await placeOrder(2);
    const payload = succeeded(order);
    await send(payload);

    const res = await send({ ...payload, amount: payload.amount + 1 });

    expect(await res.json()).toEqual({ received: true, duplicate: true, outcome: "PAID" });
    expect(await counters()).toEqual({ reserved: 0, sold: 2 });
    expect((await recorded(payload.event_id))[0]!.payload).toEqual(payload);
    expect(warnings).toHaveBeenCalledWith(expect.any(String), { eventId: payload.event_id });
  });

  it("does not warn for a repeat whose JSON differs only in key order or whitespace", async () => {
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    const order = await placeOrder(1);
    const payload = succeeded(order);
    await send(payload);
    const reordered = `{ "amount": ${payload.amount}, "order_id": "${order.id}",
      "event_type": "payment.succeeded", "event_id": "${payload.event_id}" }`;

    const res = await sendRaw(reordered, sign(reordered));

    expect((await res.json()).duplicate).toBe(true);
    expect(warnings).not.toHaveBeenCalled();
  });

  it("processes two simultaneous copies of one event only once", async () => {
    const order = await placeOrder(2);
    const payload = succeeded(order);

    const results = await raceBehindLock(
      testDb.db,
      sql`SELECT 1 FROM orders WHERE id = ${order.id} FOR UPDATE`,
      [1, 2].map(() => async () => {
        const res = await send(payload);
        return { status: res.status, body: await res.json() };
      }),
    );

    const responses = fulfilledValues(results);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(responses.map((r) => r.body.duplicate).sort()).toEqual([false, true]);
    expect(await ticketCount(order.id)).toBe(2);
    expect(await counters()).toEqual({ reserved: 0, sold: 2 });
  });

  it("answers a new event for an already PAID order without issuing again", async () => {
    const order = await placeOrder(1);
    await send(succeeded(order));

    const res = await send(succeeded(order));

    expect(await res.json()).toEqual({ received: true, duplicate: false, outcome: "ALREADY_PAID" });
    expect(await ticketCount(order.id)).toBe(1);
    expect(await counters()).toEqual({ reserved: 0, sold: 1 });
  });

  it("does not mark the order paid when the amount differs from total_price", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const order = await placeOrder(2);
    const payload = succeeded(order, { amount: order.totalPrice - 1 });

    const res = await send(payload);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, duplicate: false, outcome: "AMOUNT_MISMATCH" });
    expect((await orderRow(order.id)).status).toBe("PENDING");
    expect(await ticketCount(order.id)).toBe(0);
    expect(await counters()).toEqual({ reserved: 2, sold: 0 });
    expect((await recorded(payload.event_id))[0]!.outcome).toBe("AMOUNT_MISMATCH");
    expect(errors).toHaveBeenCalled();
  });

  it("records an event for an unknown order with a null order_id", async () => {
    const payload = succeeded({ id: randomUUID(), totalPrice: PRICE });

    const res = await send(payload);

    expect(await res.json()).toEqual({ received: true, duplicate: false, outcome: "ORDER_NOT_FOUND" });
    expect((await recorded(payload.event_id))[0]).toMatchObject({ orderId: null, outcome: "ORDER_NOT_FOUND" });
  });
});

describe("POST /webhooks/payment after the hold", () => {
  it("flags an EXPIRED order REFUND_REQUIRED without touching the quota or issuing tickets", async () => {
    const order = await placeOrder(2);
    clock.advance(HOLD_MS);
    expect(await expireOrder(testDb.db, order.id, clock.now())).toBe(true);
    const before = await counters();

    const res = await send(succeeded(order));

    expect(await res.json()).toEqual({ received: true, duplicate: false, outcome: "REFUND_REQUIRED" });
    const row = await orderRow(order.id);
    expect(row.status).toBe("REFUND_REQUIRED");
    expect(row.refundRequiredAt?.getTime()).toBe(clock.now().getTime());
    expect(await counters()).toEqual(before);
    expect(await ticketCount(order.id)).toBe(0);
  });

  it("flags a CANCELLED order REFUND_REQUIRED without touching the quota", async () => {
    const order = await placeOrder(2);
    await call(app, "POST", `/orders/${order.id}/cancel`, { token: buyer.token });

    const res = await send(succeeded(order));

    expect((await res.json()).outcome).toBe("REFUND_REQUIRED");
    expect((await orderRow(order.id)).status).toBe("REFUND_REQUIRED");
    expect(await counters()).toEqual({ reserved: 0, sold: 0 });
  });

  it("releases the hold itself when the order is still PENDING past expires_at", async () => {
    const order = await placeOrder(2);
    clock.advance(HOLD_MS);

    const res = await send(succeeded(order));

    expect((await res.json()).outcome).toBe("REFUND_REQUIRED");
    expect((await orderRow(order.id)).status).toBe("REFUND_REQUIRED");
    // Out of PENDING, the sweeper will never return this hold, so the webhook does.
    expect(await counters()).toEqual({ reserved: 0, sold: 0 });
    expect(await expireOrder(testDb.db, order.id, clock.now())).toBe(false);
    expect(await counters()).toEqual({ reserved: 0, sold: 0 });
  });

  it("returns the hold exactly once when a late webhook and the sweeper race", async () => {
    const other = await buyerToken(app);
    await placeOrder(2, other.token);
    const order = await placeOrder(2);
    clock.advance(HOLD_MS);
    expect(await counters()).toEqual({ reserved: 4, sold: 0 });

    const results = await raceBehindLock<unknown>(
      testDb.db,
      sql`SELECT 1 FROM orders WHERE id = ${order.id} FOR UPDATE`,
      [async () => (await send(succeeded(order))).json(), () => expireOrder(testDb.db, order.id, clock.now())],
    );

    const [webhook] = fulfilledValues(results);
    expect(webhook).toMatchObject({ outcome: "REFUND_REQUIRED" });
    expect((await orderRow(order.id)).status).toBe("REFUND_REQUIRED");
    // Only the other buyer's hold remains; a double release would leave 0.
    expect(await counters()).toEqual({ reserved: 2, sold: 0 });
    expect(await ticketCount(order.id)).toBe(0);
  });

  it("answers a second late event for a REFUND_REQUIRED order without changes", async () => {
    const order = await placeOrder(1);
    clock.advance(HOLD_MS);
    await send(succeeded(order));

    const res = await send(succeeded(order));

    expect((await res.json()).outcome).toBe("ALREADY_REFUND_REQUIRED");
    expect(await counters()).toEqual({ reserved: 0, sold: 0 });
  });
});

describe("POST /webhooks/payment payment.failed", () => {
  it("leaves the order PENDING and payable", async () => {
    const order = await placeOrder(2);

    const res = await send(succeeded(order, { event_type: "payment.failed" }));

    expect(await res.json()).toEqual({ received: true, duplicate: false, outcome: "PAYMENT_FAILED" });
    expect((await orderRow(order.id)).status).toBe("PENDING");
    expect(await counters()).toEqual({ reserved: 2, sold: 0 });

    expect((await (await send(succeeded(order))).json()).outcome).toBe("PAID");
  });
});

describe("webhook route registration", () => {
  it("does not exist without a webhook secret", async () => {
    const bare = createApp({ db: testDb.db, clock, auth: testAuthSettings });
    const res = await bare.request("/webhooks/payment", { method: "POST", body: "{}" });
    expect(res.status).toBe(404);
  });
});
