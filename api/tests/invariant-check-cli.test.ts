import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { formatReport } from "../src/modules/invariants/format.js";
import type { InvariantReport } from "../src/modules/invariants/service.js";
import { systemClock } from "../src/shared/clock.js";
import { buyerToken, call, organizerToken, testAuthSettings } from "./helpers/auth.js";
import { createTestEvent } from "./helpers/events.js";
import { startTestDatabase } from "./helpers/postgres.js";

const CLI = fileURLToPath(new URL("../../tools/invariant-check/check.mts", import.meta.url));
const API_DIR = fileURLToPath(new URL("..", import.meta.url));

function runCli(databaseUrl: string | undefined, args: string[] = []) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const env = { ...process.env, DATABASE_URL: databaseUrl };
    if (databaseUrl === undefined) delete env.DATABASE_URL;
    execFile(process.execPath, ["--import", "tsx", CLI, ...args], { cwd: API_DIR, env }, (err, stdout, stderr) => {
      resolve({ code: err ? Number(err.code ?? 1) : 0, stdout, stderr });
    });
  });
}

describe("formatReport", () => {
  const report: InvariantReport = {
    ok: false,
    checks: [
      {
        id: "reserved_matches_pending",
        description: "reserved = jumlah quantity pesanan PENDING",
        ok: true,
        checked: 2,
        values: { reserved: 3, pendingQuantity: 3 },
        violations: [],
      },
      {
        id: "orders_within_quota",
        description: "jumlah quantity pesanan PENDING + PAID <= quota",
        ok: false,
        checked: 2,
        values: { activeQuantity: 140, quota: 120 },
        violations: [
          {
            subject: { eventId: "e1", ticketTypeId: "t1", kind: "REGULAR" },
            values: { activeQuantity: 140, quota: 100 },
          },
        ],
      },
    ],
  };

  it("prints one OK or LANGGAR line per check with the compared numbers, then each violation", () => {
    expect(formatReport(report)).toBe(
      [
        "Hasil: LANGGAR (1 dari 2 pemeriksaan dilanggar)",
        "",
        "[OK]      reserved = jumlah quantity pesanan PENDING (2 diperiksa): reserved=3, pendingQuantity=3",
        "[LANGGAR] jumlah quantity pesanan PENDING + PAID <= quota (2 diperiksa): activeQuantity=140, quota=120",
        "          eventId=e1 ticketTypeId=t1 kind=REGULAR: activeQuantity=140, quota=100",
        "",
      ].join("\n"),
    );
  });

  it("says OK when nothing is violated", () => {
    const clean = { ok: true, checks: [report.checks[0]!] };
    expect(formatReport(clean).split("\n")[0]).toBe("Hasil: OK (1 pemeriksaan)");
  });
});

describe("tools/invariant-check CLI", () => {
  let testDb: Awaited<ReturnType<typeof startTestDatabase>>;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const app = createApp({ db: testDb.db, clock: systemClock, auth: testAuthSettings });
    const organizer = await organizerToken(testDb.db, app);
    const event = await createTestEvent(app, organizer.token);
    const buyer = await buyerToken(app);
    await call(app, "POST", "/orders", { token: buyer.token, body: { ticketTypeId: event.regular.id, quantity: 2 } });
  });

  afterAll(async () => {
    await testDb?.stop();
  });

  it("exits 0 and prints OK for a consistent database", async () => {
    const result = await runCli(testDb.databaseUrl);

    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/^Hasil: OK \(6 pemeriksaan\)/);
  });

  it("exits 1 and prints LANGGAR once a counter drifts, and --json prints the report", async () => {
    await testDb.db.execute(sql`UPDATE ticket_types SET reserved = reserved + 1 WHERE kind = 'REGULAR'`);

    const text = await runCli(testDb.databaseUrl);
    const json = await runCli(testDb.databaseUrl, ["--json"]);

    expect(text.code).toBe(1);
    expect(text.stdout).toMatch(/^\[LANGGAR\] reserved = jumlah quantity pesanan PENDING/m);
    expect(json.code).toBe(1);
    expect(JSON.parse(json.stdout)).toMatchObject({ ok: false });
  });

  it("exits 2 without DATABASE_URL", async () => {
    const result = await runCli(undefined);

    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/DATABASE_URL/);
  });
});
