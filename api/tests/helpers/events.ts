import type { createApp } from "../../src/app.js";
import { call } from "./auth.js";

type App = ReturnType<typeof createApp>;

interface TicketTypeOptions {
  price: number;
  quota: number;
}

export interface TestTicketType {
  id: string;
  kind: "REGULAR" | "VIP";
  price: number;
}

export interface TestEvent {
  id: string;
  startsAt: string;
  regular: TestTicketType;
  vip: TestTicketType;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function createTestEvent(
  app: App,
  organizerToken: string,
  options: { startsAt?: Date; regular?: TicketTypeOptions; vip?: TicketTypeOptions } = {},
): Promise<TestEvent> {
  const startsAt = options.startsAt ?? new Date(Date.now() + THIRTY_DAYS_MS);
  const res = await call(app, "POST", "/events", {
    token: organizerToken,
    body: {
      title: "Test Event",
      venue: "Test Hall",
      startsAt: startsAt.toISOString(),
      ticketTypes: [
        { kind: "REGULAR", ...(options.regular ?? { price: 100_000, quota: 100 }) },
        { kind: "VIP", ...(options.vip ?? { price: 400_000, quota: 20 }) },
      ],
    },
  });
  if (res.status !== 201) {
    throw new Error(`createTestEvent failed with ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  const byKind = (kind: string) => body.ticketTypes.find((t: TestTicketType) => t.kind === kind) as TestTicketType;
  return { id: body.id, startsAt: body.startsAt, regular: byKind("REGULAR"), vip: byKind("VIP") };
}
