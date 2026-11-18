import { sql } from "drizzle-orm";
import type { QuotaStrategyName } from "../../shared/config.js";
import type { Executor } from "../../shared/db/client.js";

export interface QuotaStrategy {
  // Adds `quantity` to the ticket type's reserved count. Returns false when
  // the remaining quota is too small.
  reserve(tx: Executor, ticketTypeId: string, quantity: number): Promise<boolean>;
}

// Check and write happen in one statement. A concurrent writer holding the row
// makes this wait, then Postgres re-evaluates the WHERE against the new row.
export const atomicStrategy: QuotaStrategy = {
  async reserve(tx, ticketTypeId, quantity) {
    const { rows } = await tx.execute(sql`
      UPDATE ticket_types
      SET reserved = reserved + ${quantity}
      WHERE id = ${ticketTypeId} AND sold + reserved + ${quantity} <= quota
      RETURNING id
    `);
    return rows.length === 1;
  },
};

// DELIBERATELY UNSAFE. Exists only to demonstrate oversell next to the atomic
// strategy (QUOTA_STRATEGY=naive). Reading the counters into the application
// and writing back an absolute value leaves a gap: two transactions can both
// read reserved = N, both pass the check, and both write N + q. One update is
// lost, so more orders exist than reserved seats, and because the stored
// counter still looks valid the CHECK constraint never notices.
// Never use this outside the demo.
export const naiveStrategy: QuotaStrategy = {
  async reserve(tx, ticketTypeId, quantity) {
    const { rows } = await tx.execute<{ quota: number; sold: number; reserved: number }>(sql`
      SELECT quota, sold, reserved FROM ticket_types WHERE id = ${ticketTypeId}
    `);
    const current = rows[0];
    if (!current || current.sold + current.reserved + quantity > current.quota) {
      return false;
    }
    await tx.execute(sql`
      UPDATE ticket_types SET reserved = ${current.reserved + quantity} WHERE id = ${ticketTypeId}
    `);
    return true;
  },
};

export const quotaStrategies: Record<QuotaStrategyName, QuotaStrategy> = {
  atomic: atomicStrategy,
  naive: naiveStrategy,
};
