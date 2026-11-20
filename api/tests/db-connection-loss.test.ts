import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDatabase } from "./helpers/postgres.js";

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;

beforeAll(async () => {
  testDb = await startTestDatabase();
});

afterAll(async () => {
  await testDb?.stop();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function terminate(pid: number) {
  const admin = new Client({ connectionString: testDb.databaseUrl });
  await admin.connect();
  await admin.query("SELECT pg_terminate_backend($1)", [pid]);
  await admin.end();
}

describe("a pooled connection lost while checked out", () => {
  // Same path as the idle-in-transaction timeout that took the dev API down:
  // Postgres ends the session of a client that is inside a transaction.
  it("fails only that transaction, without an uncaught error, and the pool keeps serving", async () => {
    const uncaught: unknown[] = [];
    const record = (err: unknown) => uncaught.push(err);
    process.on("uncaughtException", record);
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const transaction = testDb.db.transaction(async (tx) => {
        const { rows } = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
        await terminate(rows[0]!.pid);
        await sleep(300);
        await tx.execute(sql`SELECT 1`);
      });

      await expect(transaction).rejects.toThrow();
      expect(uncaught).toEqual([]);

      const { rows } = await testDb.db.execute<{ ok: number }>(sql`SELECT 1 AS ok`);
      expect(rows[0]!.ok).toBe(1);
      expect(warnings).toHaveBeenCalledWith(expect.stringContaining("Database connection lost"));
    } finally {
      process.off("uncaughtException", record);
      warnings.mockRestore();
    }
  });
});
