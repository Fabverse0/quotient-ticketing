import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { createDatabase } from "../src/shared/db/client.js";
import { buyerToken, call, organizerToken, testAuthSettings } from "./helpers/auth.js";
import { createTestEvent } from "./helpers/events.js";
import { createFakeClock } from "./helpers/fake-clock.js";
import { holdLock } from "./helpers/locks.js";
import { startTestDatabase } from "./helpers/postgres.js";

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
const clock = createFakeClock(new Date());

beforeAll(async () => {
  testDb = await startTestDatabase();
});

afterAll(async () => {
  await testDb?.stop();
});

describe("database timeouts", () => {
  it("sets lock_timeout on every pooled session, and 0 turns it off for migrations", async () => {
    const show = async (dbLockTimeoutMs?: number) => {
      const database = createDatabase({ databaseUrl: testDb.databaseUrl, dbPoolMax: 1, dbLockTimeoutMs });
      try {
        const { rows } = await database.db.execute<{ lock_timeout: string }>(sql`SHOW lock_timeout`);
        return rows[0]!.lock_timeout;
      } finally {
        await database.close();
      }
    };

    expect(await show()).toBe("5s");
    expect(await show(750)).toBe("750ms");
    expect(await show(0)).toBe("0");
  });

  it("answers 503 DATABASE_BUSY when a lock wait exceeds the lock timeout", async () => {
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    const impatient = createDatabase({ databaseUrl: testDb.databaseUrl, dbPoolMax: 2, dbLockTimeoutMs: 200 });
    const app = createApp({ db: impatient.db, clock, auth: testAuthSettings });
    try {
      const organizer = await organizerToken(testDb.db, app);
      const event = await createTestEvent(app, organizer.token);
      const buyer = await buyerToken(app);

      const held = await holdLock(testDb.db, sql`SELECT 1 FROM ticket_types WHERE id = ${event.regular.id} FOR UPDATE`);
      let res: Response;
      try {
        res = await call(app, "POST", "/orders", {
          token: buyer.token,
          body: { ticketTypeId: event.regular.id, quantity: 1 },
        });
      } finally {
        await held.release();
      }

      expect(res.status).toBe(503);
      expect((await res.json()).error.code).toBe("DATABASE_BUSY");
      const [{ count }] = (
        await testDb.db.execute<{ count: number }>(sql`
          SELECT count(*)::int AS count FROM orders WHERE ticket_type_id = ${event.regular.id}
        `)
      ).rows as [{ count: number }];
      expect(count).toBe(0);
      expect(warnings).toHaveBeenCalled();
    } finally {
      await impatient.close();
      vi.restoreAllMocks();
    }
  });

  it("answers 503 DATABASE_BUSY when no pooled connection frees up in time", async () => {
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tiny = createDatabase({ databaseUrl: testDb.databaseUrl, dbPoolMax: 1, dbConnectionTimeoutMs: 200 });
    const app = createApp({ db: tiny.db, clock, auth: testAuthSettings });
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let signalHeld!: () => void;
    const heldSignal = new Promise<void>((resolve) => (signalHeld = resolve));
    const occupying = tiny.db.transaction(async () => {
      signalHeld();
      await released;
    });
    try {
      await heldSignal;
      const res = await call(app, "GET", "/events");

      expect(res.status).toBe(503);
      expect((await res.json()).error.code).toBe("DATABASE_BUSY");
      expect(warnings).toHaveBeenCalled();
    } finally {
      release();
      await occupying;
      await tiny.close();
      vi.restoreAllMocks();
    }
  });
});
