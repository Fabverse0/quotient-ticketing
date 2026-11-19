import { sql } from "drizzle-orm";
import { releaseReservation } from "../../src/modules/orders/queries.js";
import type { Database } from "../../src/shared/db/client.js";

// Stand-in for the sweeper on a single order: the same PENDING guard and a
// relative release. Swap for the real sweeper once that module exists.
export async function expireOrder(db: Database, orderId: string, now: Date): Promise<boolean> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.execute<{ ticketTypeId: string; quantity: number }>(sql`
      UPDATE orders SET status = 'EXPIRED', expired_at = ${now}
      WHERE id = ${orderId} AND status = 'PENDING' AND expires_at <= ${now}
      RETURNING ticket_type_id AS "ticketTypeId", quantity
    `);
    const expired = rows[0];
    if (expired) await releaseReservation(tx, expired.ticketTypeId, expired.quantity);
    return Boolean(expired);
  });
}
