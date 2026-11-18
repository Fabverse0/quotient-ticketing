import { sql } from "drizzle-orm";
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
