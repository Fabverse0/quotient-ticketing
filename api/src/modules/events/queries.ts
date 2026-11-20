import { asc, eq, sql } from "drizzle-orm";
import type { Executor } from "../../shared/db/client.js";
import { events, orderStatus, ticketTypes } from "../../shared/db/schema.js";
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

// Every status appears, in the order of the state machine, even with no orders in it.
export async function tallyOrdersByStatus(db: Executor, eventId: string) {
  const { rows } = await db.execute<{ status: string; orders: number; quantity: number }>(sql`
    SELECT status, COUNT(*)::int AS orders, COALESCE(SUM(quantity), 0)::int AS quantity
    FROM orders
    WHERE event_id = ${eventId}
    GROUP BY status
  `);
  const found = new Map(rows.map((r) => [r.status, r]));
  return orderStatus.enumValues.map((status) => ({
    status,
    orders: found.get(status)?.orders ?? 0,
    quantity: found.get(status)?.quantity ?? 0,
  }));
}

// Seats sold per paid order, oldest first, for the sales-over-time chart. Past the
// limit the newest orders are kept, so the chart never stops short of the latest sale.
export async function listPaidSales(db: Executor, eventId: string, limit: number) {
  // Raw SQL returns timestamps as Postgres text, so the ISO string is built here.
  const { rows } = await db.execute<{ at: string; kind: "REGULAR" | "VIP"; quantity: number }>(sql`
    SELECT "at", kind, quantity FROM (
      SELECT o.paid_at, o.id, tt.kind, o.quantity,
             to_char(o.paid_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "at"
      FROM orders o
      JOIN ticket_types tt ON tt.id = o.ticket_type_id
      WHERE o.event_id = ${eventId} AND o.status = 'PAID'
      ORDER BY o.paid_at DESC, o.id DESC
      LIMIT ${limit}
    ) newest
    ORDER BY paid_at, id
  `);
  return rows;
}
