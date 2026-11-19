import { sql } from "drizzle-orm";
import type { QuotaStrategyName } from "../../shared/config.js";
import type { Executor } from "../../shared/db/client.js";

export interface QuotaStrategy {
  // Returns false when the remaining quota is too small.
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

// DELIBERATELY UNSAFE, oversell demo only: two transactions can both read N and
// both write N + q, losing one update in a way the CHECK constraint cannot see.
// raceDelayMs (NAIVE_RACE_DELAY_MS) stands in for app logic between the check
// and the write. It does not create the bug, it only makes the existing one
// show up on every run instead of when the timing happens to line up.
export function createNaiveStrategy(raceDelayMs = 0): QuotaStrategy {
  return {
    async reserve(tx, ticketTypeId, quantity) {
      const { rows } = await tx.execute<{ quota: number; sold: number; reserved: number }>(sql`
        SELECT quota, sold, reserved FROM ticket_types WHERE id = ${ticketTypeId}
      `);
      const current = rows[0];
      if (!current || current.sold + current.reserved + quantity > current.quota) {
        return false;
      }
      if (raceDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, raceDelayMs));
      await tx.execute(sql`
        UPDATE ticket_types SET reserved = ${current.reserved + quantity} WHERE id = ${ticketTypeId}
      `);
      return true;
    },
  };
}

export const naiveStrategy = createNaiveStrategy();

// The delay only ever reaches the naive strategy.
export function createQuotaStrategy(name: QuotaStrategyName, naiveRaceDelayMs = 0): QuotaStrategy {
  return name === "naive" ? createNaiveStrategy(naiveRaceDelayMs) : atomicStrategy;
}
