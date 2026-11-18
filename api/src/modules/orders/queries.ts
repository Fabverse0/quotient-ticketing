import { eq, sql } from "drizzle-orm";
import type { Executor } from "../../shared/db/client.js";
import { events, orders, ticketTypes } from "../../shared/db/schema.js";

export type OrderRow = typeof orders.$inferSelect;
export type TicketKind = (typeof ticketTypes.$inferSelect)["kind"];

export interface OrderWithContext {
  order: OrderRow;
  eventTitle: string;
  eventStartsAt: Date;
  ticketKind: TicketKind;
}

export interface TicketTypeForOrder {
  id: string;
  eventId: string;
  kind: TicketKind;
  price: number;
  eventTitle: string;
  eventStartsAt: Date;
}

export async function findTicketTypeForOrder(db: Executor, ticketTypeId: string): Promise<TicketTypeForOrder | undefined> {
  const [row] = await db
    .select({
      id: ticketTypes.id,
      eventId: ticketTypes.eventId,
      kind: ticketTypes.kind,
      price: ticketTypes.price,
      eventTitle: events.title,
      eventStartsAt: events.startsAt,
    })
    .from(ticketTypes)
    .innerJoin(events, eq(events.id, ticketTypes.eventId))
    .where(eq(ticketTypes.id, ticketTypeId))
    .limit(1);
  return row;
}

// Serializes order creation per (buyer, event) until the transaction ends.
// A hash collision between two pairs only makes them wait for each other.
export async function lockBuyerEvent(tx: Executor, buyerId: string, eventId: string): Promise<void> {
  await tx.execute(sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${buyerId}::text || ':' || ${eventId}::text, 0))
  `);
}

// Must run after lockBuyerEvent. Under READ COMMITTED this statement takes a
// fresh snapshot, so it sees orders committed by the previous lock holder.
export async function activeTicketCount(tx: Executor, buyerId: string, eventId: string): Promise<number> {
  const { rows } = await tx.execute<{ total: number }>(sql`
    SELECT coalesce(sum(quantity), 0)::int AS total
    FROM orders
    WHERE buyer_id = ${buyerId} AND event_id = ${eventId} AND status IN ('PENDING', 'PAID')
  `);
  return rows[0]!.total;
}

export async function insertPendingOrder(
  tx: Executor,
  values: Pick<
    typeof orders.$inferInsert,
    "buyerId" | "eventId" | "ticketTypeId" | "quantity" | "totalPrice" | "createdAt" | "expiresAt"
  >,
): Promise<OrderRow> {
  const [row] = await tx
    .insert(orders)
    .values({ ...values, status: "PENDING" })
    .returning();
  return row!;
}
