import { and, eq, sql } from "drizzle-orm";
import type { Executor } from "../../shared/db/client.js";
import { orders } from "../../shared/db/schema.js";

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
