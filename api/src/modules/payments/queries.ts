import { and, eq, sql } from "drizzle-orm";
import type { Executor } from "../../shared/db/client.js";
import { orders, processedEvents } from "../../shared/db/schema.js";

export type WebhookOutcome = NonNullable<(typeof processedEvents.$inferSelect)["outcome"]>;

const ownedBy = (buyerId?: string) => (buyerId ? sql`AND buyer_id = ${buyerId}` : sql``);

// Same guard as cancel and the sweeper: only one transaction can move a given
// PENDING row, and a row past expires_at is never paid.
export async function markPendingOrderPaid(
  tx: Executor,
  orderId: string,
  now: Date,
  buyerId?: string,
): Promise<{ ticketTypeId: string; quantity: number } | undefined> {
  const { rows } = await tx.execute<{ ticketTypeId: string; quantity: number }>(sql`
    UPDATE orders
    SET status = 'PAID', paid_at = ${now}
    WHERE id = ${orderId} ${ownedBy(buyerId)} AND status = 'PENDING' AND expires_at > ${now}
    RETURNING ticket_type_id AS "ticketTypeId", quantity
  `);
  return rows[0];
}

// sold + reserved stays the same, so ticket_types_capacity cannot fire here.
export async function moveReservationToSold(tx: Executor, ticketTypeId: string, quantity: number): Promise<void> {
  await tx.execute(sql`
    UPDATE ticket_types SET reserved = reserved - ${quantity}, sold = sold + ${quantity} WHERE id = ${ticketTypeId}
  `);
}

export async function findOrderStatus(tx: Executor, orderId: string, buyerId?: string) {
  const [row] = await tx
    .select({ status: orders.status })
    .from(orders)
    .where(buyerId ? and(eq(orders.id, orderId), eq(orders.buyerId, buyerId)) : eq(orders.id, orderId))
    .limit(1);
  return row?.status;
}

export async function findOrderTotal(tx: Executor, orderId: string): Promise<number | undefined> {
  const [row] = await tx.select({ totalPrice: orders.totalPrice }).from(orders).where(eq(orders.id, orderId)).limit(1);
  return row?.totalPrice;
}

// Dedupe gate: a concurrent copy of the event waits on the primary key, then
// gets no row back. order_id stays NULL for an unknown order, so the FK holds.
export async function recordWebhookEvent(
  tx: Executor,
  values: { eventId: string; eventType: string; payload: unknown; orderId: string | null; receivedAt: Date },
): Promise<boolean> {
  const { rows } = await tx.execute(sql`
    INSERT INTO processed_events (event_id, event_type, payload, order_id, received_at)
    VALUES (
      ${values.eventId},
      ${values.eventType},
      ${JSON.stringify(values.payload)}::jsonb,
      (SELECT id FROM orders WHERE id = ${values.orderId}),
      ${values.receivedAt}
    )
    ON CONFLICT (event_id) DO NOTHING
    RETURNING event_id
  `);
  return rows.length > 0;
}

export async function setWebhookOutcome(tx: Executor, eventId: string, outcome: WebhookOutcome): Promise<void> {
  await tx.update(processedEvents).set({ outcome }).where(eq(processedEvents.eventId, eventId));
}

export async function findWebhookOutcome(tx: Executor, eventId: string): Promise<WebhookOutcome | null> {
  const [row] = await tx
    .select({ outcome: processedEvents.outcome })
    .from(processedEvents)
    .where(eq(processedEvents.eventId, eventId));
  return row?.outcome ?? null;
}

// A payment that landed after the hold ended. From PENDING the caller must
// give the hold back, since the sweeper only ever looks at PENDING rows.
export async function markExpiredPendingRefundRequired(
  tx: Executor,
  orderId: string,
  now: Date,
): Promise<{ ticketTypeId: string; quantity: number } | undefined> {
  const { rows } = await tx.execute<{ ticketTypeId: string; quantity: number }>(sql`
    UPDATE orders SET status = 'REFUND_REQUIRED', refund_required_at = ${now}
    WHERE id = ${orderId} AND status = 'PENDING' AND expires_at <= ${now}
    RETURNING ticket_type_id AS "ticketTypeId", quantity
  `);
  return rows[0];
}

// EXPIRED and CANCELLED already returned their hold, so the counters stay put.
export async function markClosedOrderRefundRequired(tx: Executor, orderId: string, now: Date): Promise<boolean> {
  const { rows } = await tx.execute(sql`
    UPDATE orders SET status = 'REFUND_REQUIRED', refund_required_at = ${now}
    WHERE id = ${orderId} AND status IN ('EXPIRED', 'CANCELLED')
    RETURNING id
  `);
  return rows.length > 0;
}
