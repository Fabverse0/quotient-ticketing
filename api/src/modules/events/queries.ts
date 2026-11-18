import { asc, eq } from "drizzle-orm";
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

export interface EventWithTypes {
  event: EventRow;
  types: TicketTypeRow[];
}

function groupByEvent(rows: { event: EventRow; ticketType: TicketTypeRow }[]): EventWithTypes[] {
  const grouped = new Map<string, EventWithTypes>();
  for (const { event, ticketType } of rows) {
    const entry = grouped.get(event.id) ?? { event, types: [] };
    entry.types.push(ticketType);
    grouped.set(event.id, entry);
  }
  return [...grouped.values()];
}

const eventsWithTypes = (db: Executor) =>
  db
    .select({ event: events, ticketType: ticketTypes })
    .from(events)
    .innerJoin(ticketTypes, eq(ticketTypes.eventId, events.id));

export async function listEventsWithTypes(db: Executor): Promise<EventWithTypes[]> {
  const rows = await eventsWithTypes(db).orderBy(asc(events.startsAt), asc(events.createdAt), asc(events.id));
  return groupByEvent(rows);
}

export async function findEventWithTypes(db: Executor, id: string): Promise<EventWithTypes | undefined> {
  const rows = await eventsWithTypes(db).where(eq(events.id, id));
  return groupByEvent(rows)[0];
}
