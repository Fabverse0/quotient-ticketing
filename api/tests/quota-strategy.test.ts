import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { atomicStrategy, naiveStrategy, type QuotaStrategy } from "../src/modules/orders/strategy.js";
import { systemClock } from "../src/shared/clock.js";
import { ticketTypes } from "../src/shared/db/schema.js";
import { buyerToken, call, organizerToken, testAuthSettings } from "./helpers/auth.js";
import { createTestEvent } from "./helpers/events.js";
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

async function waitForLockWaiters(count: number) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const { rows } = await testDb.db.execute<{ waiting: number }>(sql`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'
    `);
    if (rows[0]!.waiting >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`expected ${count} backends waiting on a lock`);
}

// Forces the worst interleaving: both reservations read the row, then block on
// their UPDATE behind a holder transaction that commits afterwards.
async function raceTwoReservations(strategy: QuotaStrategy, ticketTypeId: string) {
  let signalLocked!: () => void;
  let release!: () => void;
  const locked = new Promise<void>((resolve) => (signalLocked = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));

  const holder = testDb.db.transaction(async (tx) => {
    await tx.execute(sql`SELECT 1 FROM ticket_types WHERE id = ${ticketTypeId} FOR UPDATE`);
    signalLocked();
    await released;
  });
  await locked;

  const attempts = [1, 2].map(() => testDb.db.transaction((tx) => strategy.reserve(tx, ticketTypeId, 1)));
  try {
    await waitForLockWaiters(2);
  } finally {
    release();
    await holder;
  }
  return (await Promise.all(attempts)).sort();
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
