import type { Executor } from "../../shared/db/client.js";
import { events, ticketTypes } from "../../shared/db/schema.js";
import type { CreateEventInput } from "./schemas.js";

export type EventRow = typeof events.$inferSelect;
export type TicketTypeRow = typeof ticketTypes.$inferSelect;

export async function insertEvent(
  db: Executor,
  organizerId: string,
  input: Pick<CreateEventInput, "title" | "description" | "venue" | "startsAt">,
): Promise<EventRow> {
  const [row] = await db
    .insert(events)
    .values({
      organizerId,
      title: input.title,
      description: input.description,
      venue: input.venue,
      startsAt: input.startsAt,
    })
    .returning();
  return row!;
}

export async function insertTicketTypes(
  db: Executor,
  eventId: string,
  types: CreateEventInput["ticketTypes"],
): Promise<TicketTypeRow[]> {
  return db
    .insert(ticketTypes)
    .values(types.map((t) => ({ eventId, kind: t.kind, price: t.price, quota: t.quota })))
    .returning();
}
