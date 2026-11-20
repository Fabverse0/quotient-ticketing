import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { systemClock } from "../src/shared/clock.js";
import { organizerToken, testAuthSettings } from "./helpers/auth.js";
import { createTestEvent, type TestEvent } from "./helpers/events.js";
import { startTestDatabase } from "./helpers/postgres.js";

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
let listener: Client;
let writer: Client;
let event: TestEvent;
let received: string[] = [];

beforeAll(async () => {
  testDb = await startTestDatabase();
  const app = createApp({ db: testDb.db, clock: systemClock, auth: testAuthSettings });
  const organizer = await organizerToken(testDb.db, app);
  event = await createTestEvent(app, organizer.token);

  listener = new Client({ connectionString: testDb.databaseUrl });
  await listener.connect();
  listener.on("notification", (msg) => {
    if (msg.channel === "quota_changed" && msg.payload) received.push(msg.payload);
  });
  await listener.query("LISTEN quota_changed");

  writer = new Client({ connectionString: testDb.databaseUrl });
  await writer.connect();
});

afterAll(async () => {
  await listener?.end();
  await writer?.end();
  await testDb?.stop();
});

beforeEach(() => {
  received = [];
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("quota_changed trigger", () => {
  it("notifies with the event id only once the transaction commits", async () => {
    await writer.query("BEGIN");
    await writer.query("UPDATE ticket_types SET reserved = reserved + 1 WHERE id = $1", [event.regular.id]);
    await wait(300);
    expect(received).toEqual([]);

    await writer.query("COMMIT");
    await wait(300);
    expect(received).toEqual([event.id]);
  });

  it("sends nothing when the transaction rolls back", async () => {
    await writer.query("BEGIN");
    await writer.query("UPDATE ticket_types SET sold = sold + 1 WHERE id = $1", [event.vip.id]);
    await writer.query("ROLLBACK");
    await wait(500);
    expect(received).toEqual([]);
  });

  it("folds changes to both ticket types in one transaction into one notification", async () => {
    await writer.query("BEGIN");
    await writer.query("UPDATE ticket_types SET reserved = reserved + 1 WHERE event_id = $1", [event.id]);
    await writer.query("UPDATE ticket_types SET reserved = reserved - 1 WHERE event_id = $1", [event.id]);
    await writer.query("COMMIT");
    await wait(300);
    expect(received).toEqual([event.id]);
  });

  it("ignores updates that leave sold and reserved out of the SET list", async () => {
    await writer.query("UPDATE ticket_types SET price = price WHERE id = $1", [event.regular.id]);
    await wait(300);
    expect(received).toEqual([]);
  });
});
