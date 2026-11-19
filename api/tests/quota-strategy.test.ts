import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { atomicStrategy, naiveStrategy, type QuotaStrategy } from "../src/modules/orders/strategy.js";
import { systemClock } from "../src/shared/clock.js";
import { ticketTypes } from "../src/shared/db/schema.js";
import { buyerToken, call, organizerToken, testAuthSettings } from "./helpers/auth.js";
import { createTestEvent } from "./helpers/events.js";
import { fulfilledValues, raceBehindLock } from "./helpers/locks.js";
import { startTestDatabase } from "./helpers/postgres.js";

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
let atomicApp: ReturnType<typeof createApp>;
let naiveApp: ReturnType<typeof createApp>;
let organizer: { token: string; userId: string };

beforeAll(async () => {
  testDb = await startTestDatabase();
  atomicApp = createApp({ db: testDb.db, clock: systemClock, auth: testAuthSettings });
  naiveApp = createApp({ db: testDb.db, clock: systemClock, auth: testAuthSettings, quotaStrategy: "naive" });
  organizer = await organizerToken(testDb.db, atomicApp);
});

afterAll(async () => {
  await testDb?.stop();
});

async function reservedOf(ticketTypeId: string) {
  const [row] = await testDb.db.select().from(ticketTypes).where(eq(ticketTypes.id, ticketTypeId));
  return row!.reserved;
}

// Both reservations read the row, then block on their UPDATE behind the holder.
async function raceTwoReservations(strategy: QuotaStrategy, ticketTypeId: string) {
  const results = await raceBehindLock(
    testDb.db,
    sql`SELECT 1 FROM ticket_types WHERE id = ${ticketTypeId} FOR UPDATE`,
    [1, 2].map(() => () => testDb.db.transaction((tx) => strategy.reserve(tx, ticketTypeId, 1))),
  );
  return fulfilledValues(results).sort();
}

describe("quota strategies under the worst interleaving", () => {
  it("atomic lets exactly one of two reservations take the last ticket", async () => {
    const event = await createTestEvent(atomicApp, organizer.token, { regular: { price: 10_000, quota: 1 } });

    const results = await raceTwoReservations(atomicStrategy, event.regular.id);

    expect(results).toEqual([false, true]);
    expect(await reservedOf(event.regular.id)).toBe(1);
  });

  it("naive lets both reservations through and loses one update", async () => {
    const event = await createTestEvent(atomicApp, organizer.token, { regular: { price: 10_000, quota: 1 } });

    const results = await raceTwoReservations(naiveStrategy, event.regular.id);

    // Two successful reservations for one seat, yet the counter says 1, so
    // the CHECK constraint never fires. Only comparing against orders shows it.
    expect(results).toEqual([true, true]);
    expect(await reservedOf(event.regular.id)).toBe(1);
  });
});

describe("QUOTA_STRATEGY=naive through the API", () => {
  it("still places orders and rejects an exhausted quota when requests do not overlap", async () => {
    const event = await createTestEvent(naiveApp, organizer.token, { regular: { price: 10_000, quota: 3 } });
    const first = await buyerToken(naiveApp);
    const second = await buyerToken(naiveApp);

    const ok = await call(naiveApp, "POST", "/orders", {
      token: first.token,
      body: { ticketTypeId: event.regular.id, quantity: 3 },
    });
    const exhausted = await call(naiveApp, "POST", "/orders", {
      token: second.token,
      body: { ticketTypeId: event.regular.id, quantity: 1 },
    });

    expect(ok.status).toBe(201);
    expect(exhausted.status).toBe(409);
    expect((await exhausted.json()).error.code).toBe("QUOTA_EXHAUSTED");
    expect(await reservedOf(event.regular.id)).toBe(3);
  });
});

describe("NAIVE_RACE_DELAY_MS", () => {
  async function placeConcurrently(app: ReturnType<typeof createApp>, ticketTypeId: string) {
    const buyers = [await buyerToken(app), await buyerToken(app)];
    return Promise.all(
      buyers.map(async ({ token }) => {
        const res = await call(app, "POST", "/orders", { token, body: { ticketTypeId, quantity: 1 } });
        return res.status;
      }),
    );
  }

  // B starts after A has read; without the delay A commits first and B gets 409.
  it("makes a naive request that starts later still read the stale counter", async () => {
    const delayed = createApp({
      db: testDb.db,
      clock: systemClock,
      auth: testAuthSettings,
      quotaStrategy: "naive",
      naiveRaceDelayMs: 500,
    });
    const event = await createTestEvent(delayed, organizer.token, { regular: { price: 10_000, quota: 1 } });
    const [a, b] = [await buyerToken(delayed), await buyerToken(delayed)];
    const order = (token: string) =>
      call(delayed, "POST", "/orders", { token, body: { ticketTypeId: event.regular.id, quantity: 1 } });

    const first = order(a.token);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const second = order(b.token);

    expect([(await first).status, (await second).status]).toEqual([201, 201]);
    expect(await reservedOf(event.regular.id)).toBe(1);
  });

  it("leaves the atomic strategy untouched", async () => {
    const delayMs = 2000;
    const atomic = createApp({ db: testDb.db, clock: systemClock, auth: testAuthSettings, naiveRaceDelayMs: delayMs });
    const event = await createTestEvent(atomic, organizer.token, { regular: { price: 10_000, quota: 1 } });

    const started = Date.now();
    const statuses = await placeConcurrently(atomic, event.regular.id);

    expect(Date.now() - started).toBeLessThan(delayMs);
    expect(statuses.sort()).toEqual([201, 409]);
    expect(await reservedOf(event.regular.id)).toBe(1);
  });
});
