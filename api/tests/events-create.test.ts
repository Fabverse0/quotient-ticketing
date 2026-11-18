import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createEventsService } from "../src/modules/events/service.js";
import { systemClock } from "../src/shared/clock.js";
import { events, ticketTypes } from "../src/shared/db/schema.js";
import { buyerToken, call, organizerToken, testAuthSettings } from "./helpers/auth.js";
import { startTestDatabase } from "./helpers/postgres.js";

let testDb: Awaited<ReturnType<typeof startTestDatabase>>;
let app: ReturnType<typeof createApp>;
let organizer: { token: string; userId: string };

beforeAll(async () => {
  testDb = await startTestDatabase();
  app = createApp({ db: testDb.db, clock: systemClock, auth: testAuthSettings });
  organizer = await organizerToken(testDb.db, app);
});

afterAll(async () => {
  await testDb?.stop();
});

const validEvent = () => ({
  title: "Konser Akhir Tahun",
  description: "Satu malam penuh musik",
  venue: "Istora Senayan",
  startsAt: "2026-12-31T19:00:00+07:00",
  ticketTypes: [
    { kind: "REGULAR", price: 150_000, quota: 100 },
    { kind: "VIP", price: 500_000, quota: 20 },
  ],
});

describe("POST /events", () => {
  it("creates the event with both ticket types and untouched counters", async () => {
    const res = await call(app, "POST", "/events", { token: organizer.token, body: validEvent() });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      organizerId: organizer.userId,
      title: "Konser Akhir Tahun",
      venue: "Istora Senayan",
      startsAt: "2026-12-31T12:00:00.000Z",
    });
    expect(body.ticketTypes).toMatchObject([
      { kind: "REGULAR", price: 150_000, quota: 100, sold: 0, reserved: 0, remaining: 100 },
      { kind: "VIP", price: 500_000, quota: 20, sold: 0, reserved: 0, remaining: 20 },
    ]);
  });

  it("persists the event and both ticket types", async () => {
    const created = await (await call(app, "POST", "/events", { token: organizer.token, body: validEvent() })).json();

    const rows = await testDb.db.select().from(ticketTypes).where(eq(ticketTypes.eventId, created.id));
    expect(rows.map((r) => r.kind).sort()).toEqual(["REGULAR", "VIP"]);
  });

  it("accepts a quota of zero", async () => {
    const payload = validEvent();
    payload.ticketTypes[1]!.quota = 0;
    const res = await call(app, "POST", "/events", { token: organizer.token, body: payload });
    expect(res.status).toBe(201);
  });

  it("defaults the description to empty", async () => {
    const { description: _omit, ...payload } = validEvent();
    const res = await call(app, "POST", "/events", { token: organizer.token, body: payload });
    expect(res.status).toBe(201);
    expect((await res.json()).description).toBe("");
  });

  it("rejects a request without a token", async () => {
    const res = await call(app, "POST", "/events", { body: validEvent() });
    expect(res.status).toBe(401);
  });

  it("rejects a buyer with 403", async () => {
    const buyer = await buyerToken(app);
    const res = await call(app, "POST", "/events", { token: buyer.token, body: validEvent() });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
  });

  describe("validation", () => {
    const withTypes = (ticketTypes: unknown) => ({ ...validEvent(), ticketTypes });

    it.each([
      ["a negative price", withTypes([{ kind: "REGULAR", price: -1, quota: 10 }, { kind: "VIP", price: 5, quota: 1 }]), "price"],
      ["a negative quota", withTypes([{ kind: "REGULAR", price: 1, quota: -5 }, { kind: "VIP", price: 5, quota: 1 }]), "quota"],
      ["a fractional quota", withTypes([{ kind: "REGULAR", price: 1, quota: 1.5 }, { kind: "VIP", price: 5, quota: 1 }]), "quota"],
      ["a quota above the cap", withTypes([{ kind: "REGULAR", price: 1, quota: 2_000_000 }, { kind: "VIP", price: 5, quota: 1 }]), "quota"],
      ["a price above the cap", withTypes([{ kind: "REGULAR", price: 2_000_000_000, quota: 1 }, { kind: "VIP", price: 5, quota: 1 }]), "price"],
      ["only one ticket type", withTypes([{ kind: "REGULAR", price: 1, quota: 1 }]), "ticketTypes"],
      ["no ticket types", withTypes([]), "ticketTypes"],
      ["three ticket types", withTypes([{ kind: "REGULAR", price: 1, quota: 1 }, { kind: "VIP", price: 1, quota: 1 }, { kind: "VIP", price: 1, quota: 1 }]), "ticketTypes"],
      ["two of the same kind", withTypes([{ kind: "REGULAR", price: 1, quota: 1 }, { kind: "REGULAR", price: 1, quota: 1 }]), "ticketTypes"],
      ["an unknown kind", withTypes([{ kind: "GOLD", price: 1, quota: 1 }, { kind: "VIP", price: 1, quota: 1 }]), "kind"],
      ["a blank title", { ...validEvent(), title: "   " }, "title"],
      ["a missing venue", { ...validEvent(), venue: undefined }, "venue"],
      ["a start time that is not ISO 8601", { ...validEvent(), startsAt: "besok sore" }, "startsAt"],
    ])("rejects %s", async (_label, payload, field) => {
      const res = await call(app, "POST", "/events", { token: organizer.token, body: payload });

      expect(res.status).toBe(400);
      const { error } = await res.json();
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.message).toContain(field);
    });

    it("stores nothing when validation fails", async () => {
      const before = (await testDb.db.select().from(events)).length;
      await call(app, "POST", "/events", { token: organizer.token, body: withTypes([]) });
      expect((await testDb.db.select().from(events)).length).toBe(before);
    });
  });

  it("rolls back the event when a ticket type cannot be stored", async () => {
    const service = createEventsService({ db: testDb.db });
    const before = (await testDb.db.select().from(events)).length;
    const duplicateKinds = {
      ...validEvent(),
      startsAt: new Date("2026-12-31T12:00:00Z"),
      ticketTypes: [
        { kind: "REGULAR" as const, price: 1, quota: 1 },
        { kind: "REGULAR" as const, price: 2, quota: 2 },
      ],
    };

    await expect(service.create(organizer.userId, duplicateKinds)).rejects.toThrow();

    expect((await testDb.db.select().from(events)).length).toBe(before);
  });
});
