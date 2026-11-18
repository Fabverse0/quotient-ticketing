import { and, eq, sql } from "drizzle-orm";
import type { Executor } from "../../shared/db/client.js";
import { events, idempotencyKeys, orders, ticketTypes } from "../../shared/db/schema.js";

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

// Serializes requests that share a key, so two copies of one request cannot
// both miss the lookup below. The prefix keeps it apart from lockBuyerEvent.
export async function lockIdempotencyKey(tx: Executor, buyerId: string, key: string): Promise<void> {
  await tx.execute(sql`
    SELECT pg_advisory_xact_lock(hashtextextended('idem:' || ${buyerId}::text || ':' || ${key}, 0))
  `);
}

export async function findIdempotencyKey(tx: Executor, buyerId: string, key: string) {
  const [row] = await tx
    .select({ requestHash: idempotencyKeys.requestHash, orderId: idempotencyKeys.orderId })
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.buyerId, buyerId), eq(idempotencyKeys.key, key)))
    .limit(1);
  return row;
}

export async function insertIdempotencyKey(tx: Executor, values: typeof idempotencyKeys.$inferInsert): Promise<void> {
  await tx.insert(idempotencyKeys).values(values);
}

export async function findOrderForBuyer(
  db: Executor,
  orderId: string,
  buyerId: string,
): Promise<OrderWithContext | undefined> {
  const [row] = await db
    .select({ order: orders, eventTitle: events.title, eventStartsAt: events.startsAt, ticketKind: ticketTypes.kind })
    .from(orders)
    .innerJoin(events, eq(events.id, orders.eventId))
    .innerJoin(ticketTypes, eq(ticketTypes.id, orders.ticketTypeId))
    .where(and(eq(orders.id, orderId), eq(orders.buyerId, buyerId)))
    .limit(1);
  return row;
}

// The status guard makes this the single winner among cancel, pay, and expire:
// whichever UPDATE matches the PENDING row first gets it, the rest get 0 rows.
// The expires_at guard keeps an order the sweeper has not reached yet from
// being cancelled after its hold ended.
export async function cancelPendingOrder(
  tx: Executor,
  orderId: string,
  buyerId: string,
  now: Date,
): Promise<{ ticketTypeId: string; quantity: number } | undefined> {
  const { rows } = await tx.execute<{ ticketTypeId: string; quantity: number }>(sql`
    UPDATE orders
    SET status = 'CANCELLED', cancelled_at = ${now}
    WHERE id = ${orderId} AND buyer_id = ${buyerId} AND status = 'PENDING' AND expires_at > ${now}
    RETURNING ticket_type_id AS "ticketTypeId", quantity
  `);
  return rows[0];
}

// Relative decrement, never an absolute write, whatever QUOTA_STRATEGY is.
export async function releaseReservation(tx: Executor, ticketTypeId: string, quantity: number): Promise<void> {
  await tx.execute(sql`
    UPDATE ticket_types SET reserved = reserved - ${quantity} WHERE id = ${ticketTypeId}
  `);
}
