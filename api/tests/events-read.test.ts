import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { systemClock } from "../src/shared/clock.js";
import { ticketTypes } from "../src/shared/db/schema.js";
import { call, organizerToken, testAuthSettings } from "./helpers/auth.js";
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

async function createEvent(overrides: Record<string, unknown> = {}) {
  const res = await call(app, "POST", "/events", {
    token: organizer.token,
    body: {
      title: "Event",
      venue: "Gedung A",
      startsAt: "2026-12-31T12:00:00Z",
      ticketTypes: [
        { kind: "REGULAR", price: 100_000, quota: 50 },
        { kind: "VIP", price: 400_000, quota: 10 },
      ],
      ...overrides,
    },
  });
  return (await res.json()) as {
    id: string;
    ticketTypes: { id: string; kind: string }[];
  };
}

const setCounters = (typeId: string, sold: number, reserved: number) =>
  testDb.db.update(ticketTypes).set({ sold, reserved }).where(eq(ticketTypes.id, typeId));

describe("GET /events/:id", () => {
  it("is public and shows quota and remaining per ticket type, without sold or reserved", async () => {
    const created = await createEvent({ title: "Detail Event" });

    const res = await call(app, "GET", `/events/${created.id}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: created.id,
      title: "Detail Event",
      description: "",
      venue: "Gedung A",
      startsAt: "2026-12-31T12:00:00.000Z",
      ticketTypes: [
        { id: created.ticketTypes[0]!.id, kind: "REGULAR", price: 100_000, quota: 50, remaining: 50 },
        { id: created.ticketTypes[1]!.id, kind: "VIP", price: 400_000, quota: 10, remaining: 10 },
      ],
    });
  });

  it("computes remaining as quota - sold - reserved", async () => {
    const created = await createEvent();
    const regular = created.ticketTypes.find((t) => t.kind === "REGULAR")!;
    const vip = created.ticketTypes.find((t) => t.kind === "VIP")!;
    await setCounters(regular.id, 30, 15);
    await setCounters(vip.id, 4, 6);

    const body = await (await call(app, "GET", `/events/${created.id}`)).json();

    expect(body.ticketTypes).toMatchObject([
      { kind: "REGULAR", remaining: 5 },
      { kind: "VIP", remaining: 0 },
    ]);
  });

  it("does not leak organizer-only counters: the sold and reserved split", async () => {
    const created = await createEvent();
    const body = await (await call(app, "GET", `/events/${created.id}`)).json();

    expect(body).not.toHaveProperty("organizerId");
    for (const type of body.ticketTypes) {
      expect(type).not.toHaveProperty("sold");
      expect(type).not.toHaveProperty("reserved");
    }
  });

  it("answers 404 for an event that does not exist", async () => {
    const res = await call(app, "GET", `/events/${randomUUID()}`);
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("EVENT_NOT_FOUND");
  });

  it("answers 400 for an id that is not a uuid", async () => {
    const res = await call(app, "GET", "/events/not-a-uuid");
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toContain("id");
  });
});

describe("GET /events", () => {
  it("is public and lists events soonest first with remaining quota", async () => {
    const later = await createEvent({ title: "Later", startsAt: "2027-03-01T10:00:00Z" });
    const sooner = await createEvent({ title: "Sooner", startsAt: "2027-01-01T10:00:00Z" });
    await setCounters(sooner.ticketTypes[0]!.id, 10, 5);

    const res = await call(app, "GET", "/events");

    expect(res.status).toBe(200);
    const list = (await res.json()) as { id: string; title: string; ticketTypes: { remaining: number }[] }[];
    const ours = list.filter((e) => e.id === later.id || e.id === sooner.id);
    expect(ours.map((e) => e.title)).toEqual(["Sooner", "Later"]);
    expect(ours[0]!.ticketTypes[0]!.remaining).toBe(35);
    expect(ours[1]!.ticketTypes[0]!.remaining).toBe(50);
  });

  it("returns each event once with both ticket types", async () => {
    const created = await createEvent({ title: "Once" });
    const list = (await (await call(app, "GET", "/events")).json()) as { id: string; ticketTypes: unknown[] }[];

    const matches = list.filter((e) => e.id === created.id);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.ticketTypes).toHaveLength(2);
  });
});
