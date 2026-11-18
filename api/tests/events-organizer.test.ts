import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { systemClock } from "../src/shared/clock.js";
import { ticketTypes } from "../src/shared/db/schema.js";
import { buyerToken, call, organizerToken, testAuthSettings } from "./helpers/auth.js";
import { startTestDatabase } from "./helpers/postgres.js";

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
let app: ReturnType<typeof createApp>;
let owner: { token: string; userId: string };
let otherOrganizer: { token: string; userId: string };
let event: { id: string; ticketTypes: { id: string; kind: string }[] };

beforeAll(async () => {
  testDb = await startTestDatabase();
  app = createApp({ db: testDb.db, clock: systemClock, auth: testAuthSettings });
  owner = await organizerToken(testDb.db, app);
  otherOrganizer = await organizerToken(testDb.db, app);

  const res = await call(app, "POST", "/events", {
    token: owner.token,
    body: {
      title: "Event Milik Saya",
      venue: "Gedung A",
      startsAt: "2026-12-31T12:00:00Z",
      ticketTypes: [
        { kind: "REGULAR", price: 100_000, quota: 50 },
        { kind: "VIP", price: 400_000, quota: 10 },
      ],
    },
  });
  event = await res.json();
});

afterAll(async () => {
  await testDb?.stop();
});

describe("GET /organizer/events/:id", () => {
  it("shows quota, sold, reserved and remaining per ticket type to the owner", async () => {
    const regular = event.ticketTypes.find((t) => t.kind === "REGULAR")!;
    await testDb.db.update(ticketTypes).set({ sold: 20, reserved: 7 }).where(eq(ticketTypes.id, regular.id));

    const res = await call(app, "GET", `/organizer/events/${event.id}`, { token: owner.token });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: event.id, organizerId: owner.userId, title: "Event Milik Saya" });
    expect(body.ticketTypes).toMatchObject([
      { kind: "REGULAR", price: 100_000, quota: 50, sold: 20, reserved: 7, remaining: 23 },
      { kind: "VIP", price: 400_000, quota: 10, sold: 0, reserved: 0, remaining: 10 },
    ]);
  });

  it("rejects another organizer with 403", async () => {
    const res = await call(app, "GET", `/organizer/events/${event.id}`, { token: otherOrganizer.token });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
  });

  it("rejects a buyer with 403", async () => {
    const buyer = await buyerToken(app);
    const res = await call(app, "GET", `/organizer/events/${event.id}`, { token: buyer.token });
    expect(res.status).toBe(403);
  });

  it("rejects a request without a token", async () => {
    const res = await call(app, "GET", `/organizer/events/${event.id}`);
    expect(res.status).toBe(401);
  });

  it("answers 404 for an event that does not exist", async () => {
    const res = await call(app, "GET", `/organizer/events/${randomUUID()}`, { token: owner.token });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("EVENT_NOT_FOUND");
  });

  it("answers 400 for an id that is not a uuid", async () => {
    const res = await call(app, "GET", "/organizer/events/not-a-uuid", { token: owner.token });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });
});
