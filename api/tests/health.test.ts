import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { createDatabase } from "../src/shared/db/client.js";
import { createFakeClock } from "./helpers/fake-clock.js";
import { startTestDatabase } from "./helpers/postgres.js";

const clock = createFakeClock(new Date("2026-11-21T10:00:00Z"));

describe("GET /health", () => {
  let testDb: Awaited<ReturnType<typeof startTestDatabase>>;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  });

  afterAll(async () => {
    await testDb?.stop();
  });

  it("returns 200 when the real Postgres answers", async () => {
    const app = createApp({ db: testDb.db, clock });
    const res = await app.request("/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "ok",
      database: "up",
      time: "2026-11-21T10:00:00.000Z",
    });
  });

  it("returns 503 in the standard error format when the database is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const unreachable = createDatabase({
      databaseUrl: "postgres://nobody:nobody@127.0.0.1:1/none",
      dbPoolMax: 1,
    });

    const app = createApp({ db: unreachable.db, clock });
    const res = await app.request("/health");

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: { code: "DATABASE_UNAVAILABLE", message: "Database tidak dapat dijangkau" },
    });

    await unreachable.close();
    vi.restoreAllMocks();
  });
});
