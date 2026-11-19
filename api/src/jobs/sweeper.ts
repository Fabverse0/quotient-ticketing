import { expireDueOrders, releaseReservation } from "../modules/orders/queries.js";
import type { Database } from "../shared/db/client.js";

export const SWEEP_BATCH_SIZE = 100;

// Each batch is its own short transaction: orders rows are locked first, then
// ticket_types in id order, the same lock order as payments and cancel.
export async function sweepExpiredOrders(db: Database, now: Date, batchSize = SWEEP_BATCH_SIZE): Promise<number> {
  let total = 0;
  for (;;) {
    const expired = await db.transaction(async (tx) => {
      const byTicketType = await expireDueOrders(tx, now, batchSize);
      for (const { ticketTypeId, quantity } of byTicketType) {
        await releaseReservation(tx, ticketTypeId, quantity);
      }
      return byTicketType.reduce((count, row) => count + row.orders, 0);
    });
    total += expired;
    if (expired < batchSize) return total;
  }
}
