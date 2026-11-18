import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/shared/db/migrate.js";
import { startTestDatabase } from "./helpers/postgres.js";

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;

beforeAll(async () => {
  testDb = await startTestDatabase();
});

afterAll(async () => {
  await testDb?.stop();
});

describe("database against real Postgres", () => {
  it("answers a query through the pool", async () => {
    const result = await testDb.db.execute(sql`select 1 as ok`);
    expect(result.rows[0]).toEqual({ ok: 1 });
  });

  it("can run migrations again without error", async () => {
    await expect(runMigrations(testDb.db)).resolves.toBeUndefined();
  });

  it("has all migrated tables", async () => {
    const result = await testDb.db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    expect(result.rows.map((r) => r.table_name)).toEqual([
      "events",
      "idempotency_keys",
      "orders",
      "processed_events",
      "ticket_types",
      "tickets",
      "users",
    ]);
  });

  it("enforces the quota CHECK constraint", async () => {
    const { rows } = await testDb.db.execute(
      sql`insert into users (email, password_hash, name, role) values ('o@x.com', 'h', 'o', 'organizer') returning id`,
    );
    const organizerId = rows[0]?.id;
    const event = await testDb.db.execute(
      sql`insert into events (organizer_id, title, venue, starts_at) values (${organizerId}, 'e', 'v', now()) returning id`,
    );
    const eventId = event.rows[0]?.id;

    const overbooked = testDb.db.execute(
      sql`insert into ticket_types (event_id, kind, price, quota, reserved) values (${eventId}, 'REGULAR', 100, 5, 6)`,
    );
    // Drizzle wraps the driver error; the constraint name lives on `cause`.
    await expect(overbooked).rejects.toMatchObject({
      cause: { constraint: "ticket_types_capacity" },
    });
  });
});
