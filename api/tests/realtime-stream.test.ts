import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createRealtimeHub } from "../src/realtime/hub.js";
import { issueStreamTicket } from "../src/realtime/ticket.js";
import { systemClock } from "../src/shared/clock.js";
import { TEST_JWT_SECRET, buyerToken, call, organizerToken, testAuthSettings } from "./helpers/auth.js";
import { createTestEvent, type TestEvent } from "./helpers/events.js";
import { startTestDatabase } from "./helpers/postgres.js";
import { quotaFor, readSse } from "./helpers/sse.js";

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
let hub: ReturnType<typeof createRealtimeHub>;
let app: ReturnType<typeof createApp>;
let owner: { token: string; userId: string };
let other: { token: string; userId: string };
let mine: TestEvent;
let mineToo: TestEvent;

beforeAll(async () => {
  testDb = await startTestDatabase();
  hub = createRealtimeHub({ db: testDb.db, connectionString: testDb.databaseUrl, heartbeatMs: 200, listenRetryMs: 100 });
  await hub.start();
  app = createApp({ db: testDb.db, clock: systemClock, auth: testAuthSettings, realtime: hub });
  owner = await organizerToken(testDb.db, app);
  other = await organizerToken(testDb.db, app);
  mine = await createTestEvent(app, owner.token, { regular: { price: 100_000, quota: 50 }, vip: { price: 400_000, quota: 10 } });
  mineToo = await createTestEvent(app, owner.token);
});

afterAll(async () => {
  await hub?.stop();
  await testDb?.stop();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function order(ticketTypeId: string, quantity: number) {
  const buyer = await buyerToken(app);
  const res = await call(app, "POST", "/orders", { token: buyer.token, body: { ticketTypeId, quantity } });
  expect(res.status).toBe(201);
}

async function streamTicket(eventId: string, token = owner.token) {
  return call(app, "POST", `/organizer/events/${eventId}/stream-ticket`, { token });
}

async function openOrganizerStream(eventId: string) {
  const res = await streamTicket(eventId);
  const { ticket } = (await res.json()) as { ticket: string };
  return app.request(`/organizer/events/${eventId}/stream?ticket=${ticket}`);
}

describe("GET /events/stream", () => {
  it("tells the browser to retry after 3 seconds and sends remaining seats after an order", async () => {
    const res = await app.request("/events/stream");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const stream = readSse(res);
    await stream.waitFor((m) => m.retry === 3000);

    await order(mine.regular.id, 2);

    const message = await stream.waitFor(quotaFor(mine.id));
    const body = JSON.parse(message.data!);
    expect(body.ticketTypes).toEqual([
      { id: mine.regular.id, remaining: 48 },
      { id: mine.vip.id, remaining: 10 },
    ]);
    await stream.close();
  });

  it("folds a burst of changes inside one window into one message with the final numbers", async () => {
    const burst = await createTestEvent(app, owner.token, { regular: { price: 0, quota: 100 }, vip: { price: 0, quota: 5 } });
    const stream = readSse(await app.request("/events/stream"));
    await stream.waitFor((m) => m.retry === 3000);

    for (let i = 0; i < 3; i++) {
      await testDb.db.execute(sql`UPDATE ticket_types SET reserved = reserved + 1 WHERE id = ${burst.regular.id}`);
    }
    await sleep(1200);

    const messages = stream.messages.filter(quotaFor(burst.id));
    expect(messages).toHaveLength(1);
    expect(JSON.parse(messages[0]!.data!).ticketTypes[0]).toEqual({ id: burst.regular.id, remaining: 97 });
    await stream.close();
  });

  it("sends a heartbeat comment", async () => {
    const stream = readSse(await app.request("/events/stream"));
    await stream.waitFor((m) => m.comment === "ping", 1000);
    await stream.close();
  });
});

describe("POST /organizer/events/:id/stream-ticket", () => {
  it("issues a ticket to the event owner only", async () => {
    const buyer = await buyerToken(app);
    expect((await streamTicket(mine.id)).status).toBe(200);
    expect((await call(app, "POST", `/organizer/events/${mine.id}/stream-ticket`)).status).toBe(401);
    expect((await streamTicket(mine.id, buyer.token)).status).toBe(403);
    expect((await streamTicket(mine.id, other.token)).status).toBe(403);
    expect((await streamTicket("00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });

  it("cannot be used as a login token", async () => {
    const { ticket } = (await (await streamTicket(mine.id)).json()) as { ticket: string };
    expect((await call(app, "GET", "/auth/me", { token: ticket })).status).toBe(401);
  });
});

describe("GET /organizer/events/:id/stream", () => {
  it("streams the owner's counters and a signal that recent orders changed", async () => {
    const res = await openOrganizerStream(mine.id);
    expect(res.status).toBe(200);
    const stream = readSse(res);
    await stream.waitFor((m) => m.retry === 3000);

    await order(mine.vip.id, 1);

    const message = await stream.waitFor((m) => m.event === "quota" && JSON.parse(m.data!).ticketTypes[1].reserved === 1);
    expect(JSON.parse(message.data!)).toEqual({
      eventId: mine.id,
      ticketTypes: [
        { id: mine.regular.id, quota: 50, sold: 0, reserved: 2, remaining: 48 },
        { id: mine.vip.id, quota: 10, sold: 0, reserved: 1, remaining: 9 },
      ],
    });
    await stream.waitFor((m) => m.event === "orders" && JSON.parse(m.data!).eventId === mine.id);
    await stream.close();
  });

  it("rejects a missing, forged or expired ticket", async () => {
    const expired = await issueStreamTicket(
      { userId: owner.userId, eventId: mine.id },
      { secret: TEST_JWT_SECRET, now: new Date(Date.now() - 120_000) },
    );
    const forged = await issueStreamTicket(
      { userId: owner.userId, eventId: mine.id },
      { secret: "another-secret-that-is-at-least-32-chars", now: new Date() },
    );

    expect((await app.request(`/organizer/events/${mine.id}/stream`)).status).toBe(401);
    expect((await app.request(`/organizer/events/${mine.id}/stream?ticket=${expired}`)).status).toBe(401);
    expect((await app.request(`/organizer/events/${mine.id}/stream?ticket=${forged}`)).status).toBe(401);
  });

  it("rejects a ticket issued for another event", async () => {
    const { ticket } = (await (await streamTicket(mineToo.id)).json()) as { ticket: string };
    expect((await app.request(`/organizer/events/${mine.id}/stream?ticket=${ticket}`)).status).toBe(401);
  });

  it("rejects a ticket held by an organizer who does not own the event", async () => {
    const ticket = await issueStreamTicket({ userId: other.userId, eventId: mine.id }, { secret: TEST_JWT_SECRET, now: new Date() });
    expect((await app.request(`/organizer/events/${mine.id}/stream?ticket=${ticket}`)).status).toBe(403);
  });

  it("rejects a login token in place of a ticket", async () => {
    expect((await app.request(`/organizer/events/${mine.id}/stream?ticket=${owner.token}`)).status).toBe(401);
  });
});

describe("LISTEN connection", () => {
  it("closes open streams when it drops, then reconnects and streams again", async () => {
    const before = readSse(await app.request("/events/stream"));
    await before.waitFor((m) => m.retry === 3000);

    await testDb.db.execute(sql`
      SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query ILIKE 'LISTEN%' AND pid <> pg_backend_pid()
    `);
    await before.waitForEnd();

    const deadline = Date.now() + 5000;
    while (!hub.listening && Date.now() < deadline) await sleep(50);
    expect(hub.listening).toBe(true);

    const after = readSse(await app.request("/events/stream"));
    await after.waitFor((m) => m.retry === 3000);
    await order(mineToo.regular.id, 1);
    await after.waitFor(quotaFor(mineToo.id));
    await after.close();
  });
});
