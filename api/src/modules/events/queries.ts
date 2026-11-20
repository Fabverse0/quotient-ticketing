import { asc, eq, sql } from "drizzle-orm";
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

export async function listEventsByOrganizer(db: Executor, organizerId: string): Promise<EventWithTypes[]> {
  const rows = await eventsWithTypes(db)
    .where(eq(events.organizerId, organizerId))
    .orderBy(asc(events.startsAt), asc(events.createdAt), asc(events.id));
  return groupByEvent(rows);
}

// The buyer's name only: an organizer has no need for an email address.
export async function listRecentOrdersForEvent(db: Executor, eventId: string, limit: number) {
  const { rows } = await db.execute<{
    id: string;
    status: string;
    quantity: number;
    totalPrice: number;
    createdAt: Date;
    expiresAt: Date;
    kind: "REGULAR" | "VIP";
    buyerName: string;
  }>(sql`
    SELECT o.id, o.status, o.quantity, o.total_price AS "totalPrice", o.created_at AS "createdAt",
           o.expires_at AS "expiresAt", tt.kind, u.name AS "buyerName"
    FROM orders o
    JOIN ticket_types tt ON tt.id = o.ticket_type_id
    JOIN users u ON u.id = o.buyer_id
    WHERE o.event_id = ${eventId}
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT ${limit}
  `);
  return rows;
}
