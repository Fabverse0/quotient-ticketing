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

// A chained setTimeout instead of setInterval: the next sweep is scheduled only
// after the previous one settles, so a slow sweep never overlaps itself.
export function startSweeper(sweep: () => Promise<number>, intervalMs: number): { stop(): Promise<void> } {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> = Promise.resolve();

  const tick = () => {
    running = sweep()
      .then((expired) => {
        if (expired > 0) console.log(`Sweeper expired ${expired} order(s)`);
      })
      .catch((err) => console.error("Sweeper run failed", err))
      .finally(() => {
        if (!stopped) timer = setTimeout(tick, intervalMs);
      });
  };
  timer = setTimeout(tick, 0);

  return {
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await running;
    },
  };
}
